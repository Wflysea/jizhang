// 分类字典：图标用 emoji，零依赖、跨平台渲染一致
export const EXPENSE_CATEGORIES = [
  { id: 'food',       name: '餐饮', icon: '🍚', color: '#FF8A3D' },
  { id: 'transport',  name: '交通', icon: '🚌', color: '#4DA6FF' },
  { id: 'shopping',   name: '购物', icon: '🛍️', color: '#FF5C8A' },
  { id: 'housing',    name: '居住', icon: '🏠', color: '#7C6BFF' },
  { id: 'entertain',  name: '娱乐', icon: '🎮', color: '#FFB400' },
  { id: 'medical',    name: '医疗', icon: '💊', color: '#38C6A4' },
  { id: 'education',  name: '教育', icon: '📚', color: '#5B8FF9' },
  { id: 'social',     name: '人情', icon: '🎁', color: '#FF7A45' },
  { id: 'telecom',    name: '通讯', icon: '📱', color: '#6DA8FF' },
  { id: 'daily',      name: '日用', icon: '🧴', color: '#9AD14B' },
  { id: 'travel',     name: '旅行', icon: '✈️', color: '#36CFC9' },
  { id: 'sport',      name: '运动', icon: '⚽', color: '#73D13D' },
  { id: 'pet',        name: '宠物', icon: '🐱', color: '#FFA940' },
  { id: 'other_e',    name: '其他', icon: '📦', color: '#BFBFBF' },
  // 手动调整账户余额时自动生成，不计入日常开销
  { id: 'adjust_e',   name: '余额调整', icon: '⚖️', color: '#8C8C8C' }
]

export const INCOME_CATEGORIES = [
  { id: 'salary',     name: '工资', icon: '💰', color: '#00B578' },
  { id: 'bonus',      name: '奖金', icon: '🏆', color: '#FFC53D' },
  { id: 'invest',     name: '理财', icon: '📈', color: '#36CFC9' },
  { id: 'parttime',   name: '兼职', icon: '💼', color: '#5B8FF9' },
  { id: 'redpacket',  name: '红包', icon: '🧧', color: '#F5453D' },
  { id: 'reimburse',  name: '报销', icon: '🧾', color: '#9254DE' },
  { id: 'rent_i',     name: '租金', icon: '🏡', color: '#7C6BFF' },
  { id: 'other_i',    name: '其他', icon: '➕', color: '#BFBFBF' },
  // 手动调整账户余额时自动生成
  { id: 'adjust_i',   name: '余额调整', icon: '⚖️', color: '#8C8C8C' }
]

/* 转账：账户之间的资金互转，既不是收入也不是支出，不影响收支统计 */
export const TRANSFER_META = { id: 'transfer', name: '转账', icon: '🔄', color: '#4DA6FF' }

/* 账户一级：账户类型（内置，固定） */
export const ACCOUNT_GROUPS = [
  { id: 'cash',      name: '现金账户', icon: '💰' },
  { id: 'credit',    name: '信用卡账户', icon: '💳' },
  { id: 'financial', name: '金融账户', icon: '🏦' },
  { id: 'virtual',   name: '虚拟账户', icon: '📱' },
  { id: 'invest',    name: '投资账户', icon: '📈' },
  { id: 'debt',      name: '负债账户', icon: '📉' }
]

/* 账户二级：具体账号（用户自建）。
 * 新安装不再预置任何具体账号 —— 只保留一级账户类型，
 * 用户按需在各类型下自行添加（也可在记账页直接新建、或从 JSON/Excel 导入）。
 * 老版本升级时已存在的账号不受影响，仍会完整保留。 */
export const DEFAULT_ACCOUNTS = []

/* v1.2 及更早版本的 groupId 与账户类型 id 同名，
 * 升级到新的五大账户类型后需要把已有账号迁移到对应分组。 */
export const GROUP_MIGRATION = {
  cash: 'cash', bank: 'financial', credit: 'credit',
  alipay: 'virtual', wechat: 'virtual'
}

/** 把旧 groupId 归一到新分组；无法识别时归入金融账户 */
export function normalizeGroupId(groupId) {
  if (ACCOUNT_GROUPS.some(g => g.id === groupId)) return groupId
  return GROUP_MIGRATION[groupId] || 'financial'
}

export function getCategories(type) {
  if (type === 'income') return INCOME_CATEGORIES
  if (type === 'transfer') return [TRANSFER_META]
  return EXPENSE_CATEGORIES
}

export function getCategory(type, id) {
  // 转账没有分类概念，统一返回转账元信息
  if (type === 'transfer') return TRANSFER_META
  const list = getCategories(type)
  // 兜底优先落到「其他」，避免落到「余额调整」这类特殊分类
  return list.find(c => c.id === id)
    || list.find(c => c.id.startsWith('other_'))
    || list[0]
}

/** 是否为转账流水 */
export function isTransfer(r) {
  return r.type === 'transfer'
}

/** 是否为余额调整流水（手动改余额生成，非真实收支） */
export function isAdjust(r) {
  return r.categoryId === 'adjust_i' || r.categoryId === 'adjust_e'
}

export function getGroup(id) {
  return ACCOUNT_GROUPS.find(g => g.id === id) || ACCOUNT_GROUPS[0]
}
