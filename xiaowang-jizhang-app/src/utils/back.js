/**
 * 安卓返回键统一处理
 *
 * 背景：App 是单页应用，没有页面历史，按系统返回键会直接退出程序。
 * 这里维护一个「弹层栈」：任何覆盖层（编辑页、账户选择器、调整弹层…）
 * 打开时注册一个处理函数，返回键按下时从最近打开的层开始逐级关闭；
 * 没有任何层打开时才退出应用（且需连按两次确认，避免误触退出）。
 */
const handlers = []

/**
 * 注册一个返回键处理函数
 * @param {() => boolean} fn 返回 true 表示已消费本次返回键（阻止退出）
 * @returns {() => void} 注销函数，组件卸载时调用
 */
export function registerBack(fn) {
  handlers.push(fn)
  return () => {
    const i = handlers.indexOf(fn)
    if (i > -1) handlers.splice(i, 1)
  }
}

/**
 * 触发一次返回键：从最后注册的层开始关闭
 * @returns {boolean} true = 已关闭某个弹层；false = 当前没有弹层，可以退出
 */
export function handleBack() {
  for (let i = handlers.length - 1; i >= 0; i--) {
    let consumed = false
    try {
      consumed = handlers[i]() === true
    } catch (e) {
      consumed = false
    }
    if (consumed) return true
  }
  return false
}
