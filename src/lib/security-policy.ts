/**
 * Two-factor authentication was removed from the product on 21 October 2026,
 * at the owner's request: sign-in is email and password only, and no action
 * asks for a second factor any more. Role and resource authorization are
 * unchanged. The functions stay as the single place where that rule lives,
 * so every domain check keeps one call instead of fifteen different edits.
 */
export function mfaRequired() {
  return false;
}
export function mfaSatisfied(enabled: boolean) {
  void enabled;
  return true;
}
