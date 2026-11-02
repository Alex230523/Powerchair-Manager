/**
 * The SQL condition (on a guardian_relationship aliased g) that keeps the
 * representatives who receive the money mail of a child: all of them when
 * the club chose no split, else those of the split.
 */
export const receivesMoneySql = (g = "g") =>
  `(NOT EXISTS(SELECT 1 FROM billing_split bs WHERE bs.subject_profile_id=${g}.subject_profile_id) OR EXISTS(SELECT 1 FROM billing_split bs WHERE bs.subject_profile_id=${g}.subject_profile_id AND bs.guardian_profile_id=${g}.guardian_profile_id))`;
