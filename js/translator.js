// ============================================================
// 跟单团队工作台 · translator.js (V4 · 2026-05-24)
// 智能翻译辅助
//
// 设计原则:
//   - 调用 Supabase Edge Function 'translate-product' (云端代理)
//   - API key 永远不在前端,绝对安全
//   - 跟单维护过的字段(*_locked = true)绝对不覆盖
//   - 翻译结果自动写入 products 表 + 标记 source='ai'
//   - 跟单一旦修改 → 自动标记 *_locked = true
//
// 依赖: core.js (sb, toast)
// ============================================================

// 翻译队列(避免短时间重复调 API)
const _translateQueue = new Set();
const _translationCache = new Map();   // SKU → 结果(本会话有效)

/**
 * 翻译一个产品(自动检查锁定状态,只翻译没锁的字段)
 * @param {Object} product - { id, sku, name_en, name_cn, variant_en, notes,
 *                              name_cn_locked, notes_locked, ... }
 * @param {Object} opts    - { force: 强制翻译即使有锁 / silent: 不弹 toast }
 * @returns {Promise<Object>} 翻译结果 + 是否更新了 DB
 */
async function translateProduct(product, opts = {}) {
  if (!product || !product.sku) {
    console.warn('[translator] 缺少 SKU,跳过');
    return null;
  }
  
  // 防止短时间重复调用同一 SKU
  if (_translateQueue.has(product.sku)) {
    console.log(`[translator] ${product.sku} 已在翻译队列,跳过`);
    return _translationCache.get(product.sku) || null;
  }
  
  // 缓存命中
  if (_translationCache.has(product.sku) && !opts.force) {
    return _translationCache.get(product.sku);
  }
  
  // 检查是否需要翻译
  const needsName = !product.name_cn || product.name_cn === product.name_en;
  const needsNotes = !product.notes;
  const allLocked = product.name_cn_locked && product.notes_locked;
  
  if (allLocked && !opts.force) {
    console.log(`[translator] ${product.sku} 所有字段已锁定,跳过`);
    return { skipped: true, reason: 'all_locked' };
  }
  
  if (!needsName && !needsNotes && !opts.force) {
    console.log(`[translator] ${product.sku} 已有翻译,跳过`);
    return { skipped: true, reason: 'has_translation' };
  }
  
  _translateQueue.add(product.sku);
  
  try {
    if (!opts.silent) {
      console.log(`[translator] 翻译 ${product.sku}: ${product.name_en}`);
    }
    
    // 调 Edge Function
    const { data, error } = await sb.functions.invoke('translate-product', {
      body: {
        sku: product.sku,
        name_en: product.name_en || product.name_cn || '',  // 兜底
        variant_en: product.variant_en || product.spec_en || '',
        notes_en: product.notes || '',
      },
    });
    
    if (error) {
      console.warn(`[translator] ${product.sku} 翻译失败:`, error);
      _translateQueue.delete(product.sku);
      return { error: error.message || String(error) };
    }
    
    if (!data || data.error) {
      console.warn(`[translator] ${product.sku} 返回错误:`, data?.error);
      _translateQueue.delete(product.sku);
      return { error: data?.error || '未知错误' };
    }
    
    // 字段级保护:只更新没被锁定的字段
    const updates = {
      translated_at: new Date().toISOString(),
      translation_source: 'ai',
    };
    
    if (!product.name_cn_locked && data.name_cn) {
      updates.name_cn = data.name_cn;
    }
    if (!product.notes_locked && data.notes_cn) {
      updates.notes = data.notes_cn;
    }
    if (data.variant_cn && !product.variant_cn_locked) {
      // variant_cn 字段以后可加,目前先存到 spec_cn 或 notes
      // 暂不更新独立字段
    }
    
    // 写回 DB (如果有 id)
    if (product.id && Object.keys(updates).length > 2) {  // 至少有 1 个翻译字段更新
      const { error: updateErr } = await sb.from('products').update(updates).eq('id', product.id);
      if (updateErr) {
        console.warn(`[translator] ${product.sku} 写入 DB 失败:`, updateErr);
      } else {
        console.log(`[translator] ✓ ${product.sku} 翻译完成: ${data.name_cn}`);
      }
    }
    
    // 缓存结果
    const result = { ...data, applied: updates };
    _translationCache.set(product.sku, result);
    _translateQueue.delete(product.sku);
    return result;
    
  } catch (e) {
    console.error(`[translator] ${product.sku} 异常:`, e);
    _translateQueue.delete(product.sku);
    return { error: e.message || String(e) };
  }
}

/**
 * 批量翻译多个产品(限制并发避免触发 API 限流)
 * @param {Array} products - product 数组
 * @param {Object} opts - { concurrency: 同时翻译数, silent: 静默 }
 */
async function translateProductsBatch(products, opts = {}) {
  const concurrency = opts.concurrency || 3;  // 默认 3 个并发
  if (!products || products.length === 0) return [];
  
  if (!opts.silent) {
    console.log(`[translator] 批量翻译 ${products.length} 个产品...`);
  }
  
  const results = [];
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(p => translateProduct(p, { silent: true }))
    );
    results.push(...batchResults);
  }
  
  const successCount = results.filter(r => r && !r.error && !r.skipped).length;
  if (!opts.silent && successCount > 0) {
    console.log(`[translator] ✓ 批量完成: ${successCount} 个新翻译`);
  }
  
  return results;
}

/**
 * 标记产品字段为"人工维护"(以后 AI 不再覆盖)
 * 在跟单员手动修改字段时调用
 * @param {string} productId
 * @param {Object} lockFields - { name_cn_locked: true, notes_locked: true }
 */
async function markProductFieldsLocked(productId, lockFields) {
  if (!productId) return;
  
  const updates = {
    translation_source: 'manual',  // 来源改成 manual
  };
  
  if ('name_cn_locked' in lockFields) updates.name_cn_locked = !!lockFields.name_cn_locked;
  if ('notes_locked' in lockFields) updates.notes_locked = !!lockFields.notes_locked;
  if ('variant_cn_locked' in lockFields) updates.variant_cn_locked = !!lockFields.variant_cn_locked;
  
  try {
    await sb.from('products').update(updates).eq('id', productId);
    console.log(`[translator] 已锁定字段:`, lockFields);
  } catch (e) {
    console.warn('[translator] 锁定字段失败:', e);
  }
}

// 暴露到全局
window.translateProduct = translateProduct;
window.translateProductsBatch = translateProductsBatch;
window.markProductFieldsLocked = markProductFieldsLocked;
