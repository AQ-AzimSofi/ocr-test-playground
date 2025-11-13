declare module 'pdf-parse' {
  interface PDFInfo {
    numpages: number;
    [key: string]: any;
  }

  function pdf(dataBuffer: Buffer): Promise<PDFInfo>;

  export = pdf;
}
