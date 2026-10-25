/** mammoth（docx → 文本）浏览器构建的最小类型声明。 */
declare module "mammoth/mammoth.browser" {
  interface ExtractResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractResult>;
}
