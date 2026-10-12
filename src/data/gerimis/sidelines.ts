/**
 * Side stories in the routine cabinets. Each is a handful of lines laid into
 * a district's monthly folders, on their days: a row in a register, a note
 * under a meter round, a letter or a notice of its own. Read one month at a
 * time they are ordinary paperwork; read in order, they tell something.
 * Nothing on the forms explains them.
 *
 * A line dated after the island's today is not in the folder yet.
 *
 * The flats named here are real doors in the directory (public/map/detail.json)
 * and the neighbours are the households the site works out for those doors
 * (src/app/visitor/households.ts): Blk 314 Ang Mo Kio Avenue 3, built 1976,
 * #11-805 has nobody in it; #11-803 is the Ismail family, #11-807 the Rahmans.
 */

type L = { en: string; zh: string };
type Cell = string | L;
const l = (en: string, zh: string): L => ({ en, zh });

export interface SideRow {
  date: string;
  form: string;
  cells: Cell[];
}

export interface MeterMonth {
  prev: string;
  cur: string;
  use: string;
  note?: L;
  /** Shown even before the month's reading day (a row read early). */
  always?: boolean;
}

export interface SideSheet {
  date: string;
  sheet: {
    form: 'letter';
    issuer: L;
    title: L;
    ref: string;
    paras?: L[];
    cols?: L[];
    rows?: { day: number; cells: Cell[] }[];
    notes?: L[];
    sign?: L;
  };
}

export interface SideLine {
  id: string;
  district: string;
  /** Formal records this story already answers for: no plain line for them in the repairs register. */
  echoes?: string[];
  rows?: SideRow[];
  notes?: { date: string; form: string; note: L }[];
  sheets?: SideSheet[];
  /** The month's meter round is read on this floor of this block, and one door's figures are these. */
  meter?: { kind: 'water' | 'power'; postcode: string; floor: number; stack: number; readDay?: number; months: Record<number, MeterMonth> };
  /** A bridge checked every Tuesday, and the day it came out longer. */
  bridge?: { name: L; length: number; grows?: { from: string; by: number } };
}

export const SIDELINES: SideLine[] = [
  /* ---------------- Bridge Road, Ang Mo Kio: the night of 9 March (record E-0001) ---------------- */
  {
    id: 'bridge-road',
    district: 'ang-mo-kio',
    echoes: ['E-0001'],
    bridge: { name: l('the bridge at the end of Bridge Road', '桥路尽头的桥'), length: 48.316, grows: { from: '1999-03-09', by: 0.02 } },
    rows: [
      {
        date: '1999-03-09', form: 'repairs',
        cells: [l('Bridge Road, corner of Blk 108', '桥路，108 座转角'), l('Street signs do not match the name of the road', '路牌字样与路名不符'), l('Driver, night service 12', '12 路夜班司机'), l('Officer sent, there 06:40. Signs correct, nothing to do.', '06:40 派员到场，路牌无误，不需处理')],
      },
      {
        date: '1999-03-09', form: 'lost',
        cells: [l('Bridge Road, corner of Blk 108, by the drain', '桥路 108 座转角，水沟边'), l('Chip of enamel, blue with a white edge, about the size of a thumbnail', '搪瓷碎片一块，蓝底白边，约指甲大'), l('Not claimed', '未认领')],
      },
    ],
  },

  /* ---------------- Blk 314 Ang Mo Kio Avenue 3, #11-805: the water meter ---------------- */
  {
    id: 'empty-flat',
    district: 'ang-mo-kio',
    meter: {
      kind: 'water', postcode: '560314', floor: 11, stack: 2, readDay: 20,
      months: {
        1: { prev: '0412', cur: '0412', use: '0' },
        2: { prev: '0412', cur: '0413', use: '1', note: l('#11-805 is empty but used 1 m³. A tap may not be shut properly. Left a slip on the door asking the estate office to check.', '#11-805 空置，但有 1 立方米用量，可能是水龙头没拧紧。已在门上贴条，请管理处查看。') },
        3: { prev: '0413', cur: '0415', use: '2', note: l('#11-805: the slip left last month is gone. Door locked; knocked, nobody answered.', '#11-805：上月贴的条子不见了。门锁着，敲门没人应。') },
        4: { prev: '0415', cur: '0416', use: '1', note: l('#11-805: main valve shut and sealed by the estate office on 16.04 (see the repairs register).', '#11-805：管理处 16.04 已关总阀、贴封条（见报修登记）。') },
        5: { prev: '0416', cur: '0420', use: '4', note: l('#11-805: the valve is still shut and the seal is whole. The meter is still moving. Reported to the estate office; asked for the Water Department to look at the meter.', '#11-805：总阀还关着，封条完好，没人动过。读数照样在走。已报管理处，请水务处派人看表是不是坏了。') },
        6: { prev: '0420', cur: '0426', use: '6', note: l('#11-805: the Water Department will change the meter on 28.06.', '#11-805：水务处 28.06 来换表。') },
        7: { prev: '0000', cur: '0005', use: '5', note: l('#11-805: new meter, fitted 28.06. Valve still shut, seal whole.', '#11-805：新表，28.06 换上。总阀仍关着，封条完好。') },
        8: { prev: '0005', cur: '0011', use: '6', note: l('#11-805: a pair of women’s plastic slippers on the shoe rack outside the door. They were not there last month. Did not touch them.', '#11-805：门口鞋架上多了一双女式塑胶拖鞋，上个月没有。没有动它。') },
        9: { prev: '0011', cur: '0011', use: '0', note: l('#11-805: cleared by the estate office on 09.09 and handed back to the Housing Board. Nothing used this month.', '#11-805：管理处 09.09 已清点，单位交还建屋局。本月没有用量。') },
        10: { prev: '0011', cur: '0012', use: '1', note: l('#11-805: to be allocated. The new household moves in on 1 November. 1 m³ used.', '#11-805：待分配，新住户 11 月 1 日搬进来。本月用量 1 立方米。') },
      },
    },
    rows: [
      {
        date: '1999-04-14', form: 'repairs',
        cells: [l('Blk 314 Ang Mo Kio Avenue 3, #11-805', 'Ang Mo Kio Avenue 3 314 座 #11-805'), l('The empty flat next door: water running at night, like someone washing up, several days running, a little after 6 in the morning', '隔壁空屋夜里有水声，像有人在洗碗，一连几天，大约早上六点多'), l('Encik Ismail, #11-803', '#11-803 依斯迈大叔'), l('16.04 estate officer sent. Door locked, no answer, no light inside. Main valve shut at the meter box downstairs and sealed.', '16.04 管理处派员。门锁着，敲门没人应，门缝看屋里没开灯。在楼下水表箱把这户总阀关了，贴封条。')],
      },
      {
        date: '1999-06-03', form: 'noise',
        cells: [l('Blk 314, floor 11 corridor', '314 座 11 楼走廊'), l('About 6.40 every morning a kettle whistles in #11-805, for a while, then stops. Weekends too.', '每天早上 6:40 左右，#11-805 有烧开水的哨子声，响一阵就停。周末也有。'), l('#11-803 and #11-807', '#11-803、#11-807 住户'), l('05.06 officer waited from 6.30 to 7.15. Heard nothing. The residents agree it did not go off that day.', '05.06 派员 6:30 等到 7:15，没听到。住户说那天确实没响。')],
      },
      {
        date: '1999-06-21', form: 'noise',
        cells: [l('Blk 314, floor 11 corridor', '314 座 11 楼走廊'), l('As before. The day the officer came it did not go off; the day after he left it went off again.', '同上。投诉人说派员来的那天没响，派员一走，第二天又响了。'), l('Encik Ismail, #11-803', '#11-803 依斯迈大叔'), l('Noted. Residents asked to phone the estate office while it is going.', '已记录。请住户下次响的时候打电话到管理处。')],
      },
    ],
    sheets: [
      {
        date: '1999-07-06',
        sheet: {
          form: 'letter',
          issuer: l('Ang Mo Kio Estate Office', '宏茂桥组屋管理处'),
          title: l('Reply to the District Office: Blk 314 Ang Mo Kio Avenue 3, #11-805', '复函区办事处：Ang Mo Kio Avenue 3 314 座 #11-805'),
          ref: 'AMK/EO/314/11',
          paras: [
            l('With reference to your enquiry about the above unit.', '关于贵处查询的上述单位，现答复如下。'),
            l('The last occupant, Madam Lim Ah Moi, died at home on 9 March 1987, aged 71. She was single and has no family on our records. The Housing Board took the flat back. Her belongings were sealed inside, as the rules require, until her estate is settled.', '该单位原住户林亚妹女士，1987 年 3 月 9 日在家中去世，享年 71 岁，单身，没有登记在册的家属。单位由建屋局收回，屋内物品照规定封存在原处，等遗产手续办完再处理。'),
            l('The estate has still not been settled, which is why the flat has stayed empty and has not been allocated.', '遗产手续至今未办完，所以单位一直空着，没有重新分配。'),
            l('As to the water meter: the Water Department fitted a new meter on 28 June. The old meter was sent back for testing and found to be in order.', '水表一事：水务处 6 月 28 日来人换了新表。旧表送回检验，结果表没有坏。'),
          ],
          sign: l('Ang Mo Kio Estate Office', '宏茂桥组屋管理处'),
        },
      },
      {
        date: '1999-09-02',
        sheet: {
          form: 'letter',
          issuer: l('Ang Mo Kio Estate Office', '宏茂桥组屋管理处'),
          title: l('Notice (on the board at the void deck of Blk 314)', '通知（贴在 314 座楼下告示板）'),
          ref: 'AMK/EO/314/N',
          paras: [
            l('The estate of the late occupant of #11-805 has been settled. On Thursday 9 September at 10 am the estate office will open the unit and list what is inside. There may be some noise from moving furniture. We apologise to the neighbours.', '#11-805 已故住户的遗产手续已经办完。管理处将于 9 月 9 日（星期四）上午十点开门清点屋内物品，届时可能有搬运声音，请邻居见谅。'),
          ],
          sign: l('Ang Mo Kio Estate Office', '宏茂桥组屋管理处'),
        },
      },
      {
        date: '1999-09-09',
        sheet: {
          form: 'letter',
          issuer: l('Ang Mo Kio Estate Office', '宏茂桥组屋管理处'),
          title: l('Record of clearance · #11-805', '单位清点记录 · #11-805'),
          ref: 'AMK/EO/314/C',
          paras: [
            l('Unit: Blk 314 Ang Mo Kio Avenue 3, #11-805. Date: 9 September 1999. Present: two estate officers and a locksmith.', '单位：Ang Mo Kio Avenue 3 314 座 #11-805。日期：1999 年 9 月 9 日。在场：管理处职员两名、锁匠一名。'),
            l('1. Thick dust throughout. The furniture is where it was. No footprints in the dust on the floor.', '1. 屋内灰尘很厚，家具都在原位。地上的灰尘没有脚印。'),
            l('2. Kitchen: the taps are dry, the sink is dry, no water marks. A kettle on the stove, empty.', '2. 厨房：水龙头是干的，洗碗槽是干的，没有水渍。灶上放着一只烧水壶，壶是空的。'),
            l('3. On the dish rack, one bowl turned upside down and a pair of chopsticks. The bottom of the bowl is still a little wet.', '3. 碗架上倒扣着一只碗、一双筷子。碗底还有一点湿。'),
            l('4. On the wall, a 1987 calendar, turned to March.', '4. 墙上挂着 1987 年的月历，翻在 3 月。'),
            l('5. The women’s plastic slippers on the shoe rack outside are no longer there.', '5. 门外鞋架上的女式塑胶拖鞋已经不在了。'),
            l('6. Contents listed on three pages, attached. The unit is handed back to the Housing Board for allocation in October.', '6. 屋内物品造册三页，附后。单位交还建屋局，排进 10 月的重新分配。'),
          ],
          sign: l('Estate officer, for the record', '记录人：管理处职员'),
        },
      },
    ],
  },
];
