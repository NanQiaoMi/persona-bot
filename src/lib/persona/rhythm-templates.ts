/** 五类作息模板：时间单位为「当天第几分钟」。每张表首尾相接覆盖 0~1440。 */

import type { DailyRhythmOverride } from './spec';
import type { RhythmArchetype, RhythmTemplate } from './rhythm-types';

/** 把 时:分 转成当天分钟数，如 m(7, 30) === 450 */
const m = (hour: number, minute = 0): number => hour * 60 + minute;

const office: RhythmTemplate = {
  archetype: 'office',
  label: '朝九晚六上班族',
  keywords: ['上班', '白领', '产品', '运营', '程序员', '工程师', '架构师', '设计师', '经理', '分析师', '顾问'],
  weekday: [
    { startMin: 0, endMin: m(0, 30), availability: 'free', activities: ['还没睡着刷手机', '躺床上发呆', '被窝里刷视频'] },
    { startMin: m(0, 30), endMin: m(7, 30), availability: 'asleep', activities: ['睡着了', '睡得正香', '梦里还在改方案'] },
    { startMin: m(7, 30), endMin: m(8, 30), availability: 'busy', activities: ['洗漱赶时间', '边吃早饭边刷', '套上外套出门'] },
    { startMin: m(8, 30), endMin: m(9, 30), availability: 'busy', activities: ['挤地铁中', '地铁上晃着呢', '在公交上发呆'] },
    { startMin: m(9, 30), endMin: m(12, 0), availability: 'busy', activities: ['在工位改方案', '开周会中', '盯着需求文档发呆'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['吃饭中', '边吃边刷手机', '点了外卖等着'] },
    { startMin: m(13, 0), endMin: m(14, 0), availability: 'free', activities: ['闭眼眯一会', '刚醒来看消息'] },
    { startMin: m(14, 0), endMin: m(17, 30), availability: 'busy', activities: ['在工位改方案', '偷偷刷会儿朋友圈', '摸鱼看八卦中'] },
    { startMin: m(17, 30), endMin: m(18, 30), availability: 'busy', activities: ['挤地铁回家中', '在公交上发呆'] },
    { startMin: m(18, 30), endMin: m(19, 30), availability: 'free', activities: ['在家做晚饭', '吃饭中'] },
    { startMin: m(19, 30), endMin: m(22, 30), availability: 'free', activities: ['窝沙发追剧中', '打游戏正上头', '刷手机中', '健身练一会'] },
    { startMin: m(22, 30), endMin: m(24, 0), availability: 'free', activities: ['刚洗完澡', '躺床上刷手机'] },
  ],
  weekend: [
    { startMin: 0, endMin: m(1, 0), availability: 'free', activities: ['刷剧刷到很晚', '躺床上刷手机'] },
    { startMin: m(1, 0), endMin: m(11, 0), availability: 'asleep', activities: ['睡着了', '睡得正香', '梦里在旅游'] },
    { startMin: m(11, 0), endMin: m(12, 0), availability: 'free', activities: ['刚起床慢慢喝水', '赖床刷手机'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['约朋友吃午饭', '在饭馆吃饭'] },
    { startMin: m(13, 0), endMin: m(15, 0), availability: 'free', activities: ['补个午觉中', '窝沙发上发呆'] },
    { startMin: m(15, 0), endMin: m(18, 0), availability: 'busy', activities: ['逛街中', '在商场溜达', '在咖啡店坐着'] },
    { startMin: m(18, 0), endMin: m(19, 0), availability: 'free', activities: ['在外面约饭', '边等菜边刷手机'] },
    { startMin: m(19, 0), endMin: m(22, 0), availability: 'free', activities: ['窝沙发追剧中', '打游戏中', '宅家看综艺'] },
    { startMin: m(22, 0), endMin: m(24, 0), availability: 'free', activities: ['刷短视频中', '躺床上刷手机'] },
  ],
};

const student: RhythmTemplate = {
  archetype: 'student',
  label: '大学生',
  keywords: ['学生', '大学', '研究生', '考研', '学霸'],
  weekday: [
    { startMin: 0, endMin: m(1, 30), availability: 'free', activities: ['宿舍熬夜打游戏', '躺床上刷手机', '赶ddl写作业'] },
    { startMin: m(1, 30), endMin: m(8, 30), availability: 'asleep', activities: ['睡得正香', '睡着了', '梦里在考试'] },
    { startMin: m(8, 30), endMin: m(9, 0), availability: 'busy', activities: ['赶着去上课', '火速洗漱中', '边啃面包边跑'] },
    { startMin: m(9, 0), endMin: m(11, 30), availability: 'busy', activities: ['在教室听课中', '上课中别找我', '认真记笔记'] },
    { startMin: m(11, 30), endMin: m(12, 30), availability: 'free', activities: ['在食堂排队', '窗口好多人', '吃饭中'] },
    { startMin: m(12, 30), endMin: m(13, 30), availability: 'free', activities: ['趴桌上眯一会', '刚睡醒有点懵'] },
    { startMin: m(13, 30), endMin: m(18, 0), availability: 'busy', activities: ['在图书馆占座中', '自习中别打扰', '刷题刷到头秃'] },
    { startMin: m(18, 0), endMin: m(19, 0), availability: 'free', activities: ['在食堂吃饭', '边吃边刷手机'] },
    { startMin: m(19, 0), endMin: m(21, 30), availability: 'busy', activities: ['在操场跑步', '社团例会中', '和社员开会中'] },
    { startMin: m(21, 30), endMin: m(23, 0), availability: 'free', activities: ['宿舍里刷视频', '躺床上刷手机'] },
    { startMin: m(23, 0), endMin: m(24, 0), availability: 'free', activities: ['熬夜赶作业中', '室友还在打游戏'] },
  ],
  weekend: [
    { startMin: 0, endMin: m(2, 0), availability: 'free', activities: ['宿舍里打游戏', '躺床上刷视频'] },
    { startMin: m(2, 0), endMin: m(11, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(11, 0), endMin: m(12, 0), availability: 'free', activities: ['赖床刷手机', '叫外卖中'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['和室友去食堂', '在食堂吃饭'] },
    { startMin: m(13, 0), endMin: m(15, 0), availability: 'free', activities: ['宿舍里补觉', '窝床上追剧'] },
    { startMin: m(15, 0), endMin: m(18, 0), availability: 'busy', activities: ['在操场打球', '社团活动中', '和朋友约练球'] },
    { startMin: m(18, 0), endMin: m(20, 0), availability: 'free', activities: ['和朋友吃饭中', '在火锅店排队'] },
    { startMin: m(20, 0), endMin: m(23, 0), availability: 'free', activities: ['窝宿舍打游戏', '宅家看综艺'] },
    { startMin: m(23, 0), endMin: m(24, 0), availability: 'free', activities: ['宿舍熬夜聊天', '刷短视频中'] },
  ],
};

const creative: RhythmTemplate = {
  archetype: 'creative',
  label: '自由职业 / 创作者',
  keywords: ['插画', '画师', '自由职业', '作家', '写作', '摄影', '独立', '创作', '音乐'],
  weekday: [
    { startMin: 0, endMin: m(2, 0), availability: 'busy', activities: ['夜里赶稿中', '画稿到凌晨', '改图改到头秃'] },
    { startMin: m(2, 0), endMin: m(2, 30), availability: 'free', activities: ['收拾完准备睡', '刷一下手机'] },
    { startMin: m(2, 30), endMin: m(10, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(10, 0), endMin: m(11, 0), availability: 'free', activities: ['慢悠悠喝咖啡', '窝沙发上发呆'] },
    { startMin: m(11, 0), endMin: m(12, 0), availability: 'free', activities: ['刷刷灵感板', '看看别人的作品'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['点了外卖等着', '吃午饭中'] },
    { startMin: m(13, 0), endMin: m(18, 0), availability: 'busy', activities: ['专心画稿中', '在赶甲方的图', '改稿改到怀疑人生'] },
    { startMin: m(18, 0), endMin: m(19, 30), availability: 'free', activities: ['出门去吃饭', '在家随便煮点面'] },
    { startMin: m(19, 30), endMin: m(21, 30), availability: 'free', activities: ['听着音乐发呆', '在看一部电影'] },
    { startMin: m(21, 30), endMin: m(24, 0), availability: 'busy', activities: ['夜里赶稿中', '画稿画到半夜', '灵感来了赶紧画'] },
  ],
  weekend: [
    { startMin: 0, endMin: m(2, 0), availability: 'free', activities: ['窝被窝里刷手机', '熬夜追剧中'] },
    { startMin: m(2, 0), endMin: m(11, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(11, 0), endMin: m(12, 0), availability: 'free', activities: ['慢悠悠喝咖啡', '赖床刷朋友圈'] },
    { startMin: m(12, 0), endMin: m(14, 0), availability: 'free', activities: ['和朋友约午饭', '在外面吃饭'] },
    { startMin: m(14, 0), endMin: m(17, 0), availability: 'busy', activities: ['在街上拍照片', '逛画材店中'] },
    { startMin: m(17, 0), endMin: m(19, 0), availability: 'free', activities: ['在咖啡馆坐着', '咖啡馆里发呆'] },
    { startMin: m(19, 0), endMin: m(21, 30), availability: 'free', activities: ['和朋友吃晚饭', '边吃饭边聊天'] },
    { startMin: m(21, 30), endMin: m(24, 0), availability: 'free', activities: ['宅家看电影', '窝沙发上刷剧'] },
  ],
};

const nightOwl: RhythmTemplate = {
  archetype: 'night_owl',
  label: '夜猫子 / 媒体主笔',
  keywords: ['夜猫子', '深夜', '主笔', '媒体', '熬夜', '冲浪', '编辑', '博主'],
  weekday: [
    { startMin: 0, endMin: m(3, 0), availability: 'free', activities: ['深夜刷推特冲浪', '翻看评论区中', '半夜刷博客'] },
    { startMin: m(3, 0), endMin: m(11, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(11, 0), endMin: m(12, 0), availability: 'free', activities: ['刚醒来泡咖啡', '慢吞吞刷消息'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['点外卖等开饭', '吃午饭中'] },
    { startMin: m(13, 0), endMin: m(18, 0), availability: 'busy', activities: ['在改稿子', '采访素材整理中', '开选题会中'] },
    { startMin: m(18, 0), endMin: m(21, 0), availability: 'busy', activities: ['赶稿子截稿中', '盯着编辑稿发呆', '赶deadline中'] },
    { startMin: m(21, 0), endMin: m(23, 0), availability: 'busy', activities: ['赶稿中别找我', '写到第三段了'] },
    { startMin: m(23, 0), endMin: m(24, 0), availability: 'free', activities: ['深夜刷推特冲浪', '刷刷小红书'] },
  ],
  weekend: [
    { startMin: 0, endMin: m(4, 0), availability: 'free', activities: ['看剧看到凌晨', '深夜刷推特冲浪'] },
    { startMin: m(4, 0), endMin: m(12, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['刚起床磨蹭中', '慢悠悠刷消息'] },
    { startMin: m(13, 0), endMin: m(14, 0), availability: 'free', activities: ['慢悠悠吃早午饭', '在家煮点东西'] },
    { startMin: m(14, 0), endMin: m(16, 0), availability: 'free', activities: ['和朋友喝咖啡', '在咖啡馆坐着'] },
    { startMin: m(16, 0), endMin: m(19, 0), availability: 'busy', activities: ['偷偷写点稿子', '在改稿子'] },
    { startMin: m(19, 0), endMin: m(22, 0), availability: 'free', activities: ['在外面吃晚饭', '宅家看剧中'] },
    { startMin: m(22, 0), endMin: m(24, 0), availability: 'free', activities: ['深夜刷推特冲浪', '刷刷小红书'] },
  ],
};

const service: RhythmTemplate = {
  archetype: 'service',
  label: '店员 / 咖啡师 / 轮班',
  keywords: ['店员', '咖啡师', '护士', '医生', '服务', '轮班', '厨师', '咖啡店'],
  weekday: [
    { startMin: 0, endMin: m(5, 30), availability: 'asleep', activities: ['睡得正香', '睡着了', '梦里还在排班'] },
    { startMin: m(5, 30), endMin: m(6, 30), availability: 'busy', activities: ['赶着去店里', '套上工服出门', '路上赶时间'] },
    { startMin: m(6, 30), endMin: m(7, 30), availability: 'busy', activities: ['在店里开始备货', '煮咖啡准备开店'] },
    { startMin: m(7, 30), endMin: m(12, 0), availability: 'busy', activities: ['在吧台忙着呢', '正在招待客人', '手忙脚乱中'] },
    { startMin: m(12, 0), endMin: m(13, 0), availability: 'free', activities: ['在后厨扒两口饭', '吃饭中'] },
    { startMin: m(13, 0), endMin: m(14, 0), availability: 'busy', activities: ['交接班中', '收拾台面中'] },
    { startMin: m(14, 0), endMin: m(18, 0), availability: 'free', activities: ['在家躺一会', '窝沙发刷剧中', '去超市逛逛'] },
    { startMin: m(18, 0), endMin: m(20, 0), availability: 'free', activities: ['吃晚饭中', '在家煮面条'] },
    { startMin: m(20, 0), endMin: m(22, 0), availability: 'free', activities: ['刷短视频中', '窝沙发上发呆'] },
    { startMin: m(22, 0), endMin: m(23, 0), availability: 'free', activities: ['洗完澡准备睡', '刚洗完澡'] },
    { startMin: m(23, 0), endMin: m(24, 0), availability: 'asleep', activities: ['睡着了', '睡得正香'] },
  ],
  weekend: [
    { startMin: 0, endMin: m(7, 0), availability: 'asleep', activities: ['睡得正香', '睡着了'] },
    { startMin: m(7, 0), endMin: m(8, 0), availability: 'free', activities: ['赖床刷手机', '慢悠悠起床'] },
    { startMin: m(8, 0), endMin: m(10, 0), availability: 'free', activities: ['在家吃早饭', '去超市买菜中'] },
    { startMin: m(10, 0), endMin: m(14, 0), availability: 'busy', activities: ['在店里排班中', '在吧台忙着呢'] },
    { startMin: m(14, 0), endMin: m(15, 0), availability: 'busy', activities: ['挤公交回家中', '在路上发呆'] },
    { startMin: m(15, 0), endMin: m(18, 0), availability: 'free', activities: ['去商场溜达', '和朋友约喝奶茶'] },
    { startMin: m(18, 0), endMin: m(20, 0), availability: 'free', activities: ['窝家里吃饭', '边做饭边刷视频'] },
    { startMin: m(20, 0), endMin: m(22, 0), availability: 'free', activities: ['宅家看剧中', '窝沙发上发呆'] },
    { startMin: m(22, 0), endMin: m(24, 0), availability: 'free', activities: ['洗完澡刷手机', '躺床上刷视频'] },
  ],
};

export const RHYTHM_TEMPLATES: Record<RhythmArchetype, RhythmTemplate> = {
  office,
  student,
  creative,
  night_owl: nightOwl,
  service,
};

export interface SpecializedRhythmProfile {
  id: string;
  keywords: string[];
  override: DailyRhythmOverride;
}

/** 细分职业/兴趣作息词表覆盖（不改变 RHYTHM_TEMPLATES 5 大时间骨架，解决同质化“画稿/改稿”错配） */
export const SPECIALIZED_RHYTHM_OVERRIDES: SpecializedRhythmProfile[] = [
  {
    id: 'travel_photographer',
    keywords: ['旅拍', '摄影', '胶片', '街拍'],
    override: {
      archetype: 'creative',
      label: '自由旅拍摄影师',
      freeActivities: ['整理胶片底片中', '窗边喝冰手冲', '在旧书店发呆', '看海边日落光影'],
      busyActivities: ['背相机扫街采风', '在暗房洗底片', '蹲日落机位中', '修旅拍图选片中'],
      asleepActivities: ['睡着了', '梦里在海边散步'],
      lateNightActivities: ['挑今天拍的胶片', '听海浪白噪音'],
    },
  },
  {
    id: 'gamer',
    keywords: ['游戏', '电竞', '开黑', '双排', '排位'],
    override: {
      archetype: 'night_owl',
      label: '游戏测试 / 开黑搭子',
      freeActivities: ['研究新版本攻略', '逛游戏社区吃瓜', '喝气泡水刷视频', '开把休闲图热身'],
      busyActivities: ['测新版本bug中', '组队打排位冲分', '写测试复现报告', '高强度开黑中'],
      asleepActivities: ['熬完夜补觉中', '睡得正香'],
      lateNightActivities: ['深夜排位连胜中', '挂麦刷副本中'],
    },
  },
  {
    id: 'radio_host',
    keywords: ['电台', '书房', '心理', '深夜陪伴'],
    override: {
      archetype: 'night_owl',
      label: '深夜电台策划',
      freeActivities: ['书房泡红茶看书', '回听听众来信', '阳台吹晚风发呆', '挑今晚电台歌单'],
      busyActivities: ['录深夜电台节目', '整理听众故事稿', '剪辑电台音频中', '和团队对专栏'],
      asleepActivities: ['拉紧窗帘补觉中', '睡得正香'],
      lateNightActivities: ['亮着台灯录晚安', '读完最后几页书'],
    },
  },
  {
    id: 'foodie_explorer',
    keywords: ['美食', '探店', '烧烤', '夜宵', '炭火'],
    override: {
      archetype: 'night_owl',
      label: '城市美食探店博主',
      freeActivities: ['刷老巷子美食地图', '窝沙发看探店视频', '喝冰美式消食中', '计划今晚夜宵单'],
      busyActivities: ['在老巷子探店试菜', '拍炭火烧烤素材', '剪探店避雷视频', '大排档排队等位'],
      asleepActivities: ['吃撑了睡得正香', '睡着了'],
      lateNightActivities: ['大排档撸串测评', '巷口打包夜宵中'],
    },
  },
];

export function matchSpecializedRhythmOverride(profile?: {
  occupation?: string;
  personalityTags?: string[];
}): DailyRhythmOverride | undefined {
  const haystack = [profile?.occupation || '', ...(profile?.personalityTags || [])]
    .join(' ')
    .toLowerCase();
  if (!haystack.trim()) return undefined;

  let best: DailyRhythmOverride | undefined;
  let bestScore = 0;
  for (const item of SPECIALIZED_RHYTHM_OVERRIDES) {
    const score = item.keywords.reduce(
      (acc, k) => (k && haystack.includes(k.toLowerCase()) ? acc + 1 : acc),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = item.override;
    }
  }
  return best;
}

export const DEFAULT_RHYTHM_ARCHETYPE: RhythmArchetype = 'office';
