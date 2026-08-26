const MAX_LINK_ID_CODE_POINTS = 128;

export function hasExplicitKnowledgeLink(markdown: string, knowledgeItemId: string): boolean {
  if ([...knowledgeItemId].length === 0 || [...knowledgeItemId].length > MAX_LINK_ID_CODE_POINTS) return false;
  const normalized = markdown
    .replaceAll("\\[", "[")
    .replaceAll("\\]", "]")
    .replaceAll("\\(", "(")
    .replaceAll("\\)", ")")
    .replaceAll("\\/", "/")
    .replaceAll("\\-", "-");
  const escaped = knowledgeItemId.replace(/[.*+?^$()|[\]\\]/gu, "\\$&");
  return new RegExp("\\[\\[\\s*" + escaped + "\\s*\\]\\]", "u").test(normalized)
    || new RegExp("\\]\\(\\s*(?:https?:\\/\\/[^\\s/)]+)?\\/knowledge\\/" + escaped + "(?:[?#)\\s]|$)", "u").test(normalized)
    || new RegExp("\\]\\(\\s*knowledge:\\/\\/" + escaped + "(?:[?#)\\s]|$)", "u").test(normalized);
}
