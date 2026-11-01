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
  { id: 'other_e',    name: '其他', icon: '📦', color: '#BFBFBF' }
]

export const INCOME_CATEGORIES = [
  { id: 'salary',     name: '工资', icon: '💰', color: '#00B578' },
  { id: 'bonus',      name: '奖金', icon: '🏆', color: '#FFC53D' },
  { id: 'invest',     name: '理财', icon: '📈', color: '#36CFC9' },
  { id: 'parttime',   name: '兼职', icon: '💼', color: '#5B8FF9' },
  { id: 'redpacket',  name: '红包', icon: '🧧', color: '#F5453D' },
  { id: 'reimburse',  name: '报销', icon: '🧾', color: '#9254DE' },
  { id: 'rent_i',     name: '租金', icon: '🏡', color: '#7C6BFF' },
  { id: 'other_i',    name: '其他', icon: '➕', color: '#BFBFBF' }
]

export const ACCOUNTS = [
  { id: 'cash',    name: '现金',   icon: '💰' },
  { id: 'bank',    name: '银行卡', icon: '🏦' },
  { id: 'alipay',  name: '支付宝', icon: '🅰️' },
  { id: 'wechat',  name: '微信',   icon: '💬' },
  { id: 'credit',  name: '信用卡', icon: '💳' }
]

export function getCategories(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export function getCategory(type, id) {
  return getCategories(type).find(c => c.id === id) || getCategories(type).slice(-1)[0]
}

export function getAccount(id) {
  return ACCOUNTS.find(a => a.id === id) || ACCOUNTS[0]
}
