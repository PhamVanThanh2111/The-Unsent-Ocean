import en from "@/locales/en.json";
import vi from "@/locales/vi.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";

export type LocaleCode = "en" | "vi" | "ja" | "ko";
export type LocaleDict = typeof en;

export const DEFAULT_LOCALE: LocaleCode = "en";

export const LOCALE_OPTIONS: {
  code: LocaleCode;
  label: string;
  flag: string;
}[] = [
  { code: "en", label: "English", flag: "EN" },
  { code: "vi", label: "Tiếng Việt", flag: "VI" },
  { code: "ja", label: "日本語", flag: "JA" },
  { code: "ko", label: "한국어", flag: "KO" },
];

export const LOCALES: Record<LocaleCode, LocaleDict> = {
  en,
  vi,
  ja,
  ko,
};

/**
 * Normalizes legacy role names (e.g., "Bản thân năm 18 tuổi" -> "Bản thân")
 */
export function normalizeCanonicalRole(rawRole: string): string {
  const trimmed = rawRole.trim();
  if (
    trimmed === "Bản thân năm 18 tuổi" ||
    trimmed === "My 18-Year-Old Self" ||
    trimmed === "Myself" ||
    trimmed === "Bản thân"
  ) {
    return "Bản thân";
  }
  return trimmed;
}

/**
 * Maps canonical recipient roles (or localized variants) to the active language dictionary value
 */
export function translateRecipientRole(
  rawRole: string,
  t: LocaleDict
): string {
  const normalized = normalizeCanonicalRole(rawRole);
  switch (normalized) {
    case "Bản thân":
    case "Myself":
    case "自分自身":
    case "나 자신":
    case "role_self":
      return t.role_self;
    case "Người yêu cũ":
    case "An Ex-Lover":
    case "元恋人":
    case "옛 연인":
    case "role_ex":
      return t.role_ex;
    case "Người thân đã mất":
    case "Someone Passed Away":
    case "旅立った大切な人":
    case "떠나간 소중한 사람":
    case "role_departed":
      return t.role_departed;
    case "Crush thầm kín":
    case "Secret Crush":
    case "片思いの人":
    case "짝사랑":
    case "role_crush":
      return t.role_crush;
    case "Gia đình":
    case "Family":
    case "家族":
    case "가족":
    case "role_family":
      return t.role_family;
    case "Một người lạ":
    case "A Kind Stranger":
    case "見知らぬ誰か":
    case "낯선 누군가":
    case "role_stranger":
      return t.role_stranger;
    case "Tình đầu":
    case "First Love":
    case "初恋の人":
    case "첫사랑":
    case "role_first_love":
      return t.role_first_love;
    case "Tri kỷ đã xa":
    case "Drifted Best Friend":
    case "疎遠になった親友":
    case "멀어진 단짝 친구":
    case "role_old_friend":
      return t.role_old_friend;
    case "Người từng làm tổn thương":
    case "Someone Who Hurt Me":
    case "私を傷つけた人":
    case "나에게 상처 준 사람":
    case "role_who_hurt_me":
      return t.role_who_hurt_me;
    case "Người mình từng có lỗi":
    case "Someone I Wronged":
    case "傷つけてしまった人":
    case "내가 미안한 사람":
    case "role_whom_i_hurt":
      return t.role_whom_i_hurt;
    case "Đứa trẻ bên trong":
    case "My Inner Child":
    case "内なる子ども":
    case "내면의 아이":
    case "role_inner_child":
      return t.role_inner_child;
    case "Người thương tương lai":
    case "Future Partner":
    case "未来の恋人":
    case "미래의 연인":
    case "role_future_lover":
      return t.role_future_lover;
    default:
      return t.role_other;
  }
}
