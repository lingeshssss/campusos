export async function extractPdf(file: File, progress: (message: string) => void) { if (file.size > 5 * 1024 * 1024)
    throw Error('Choose a PDF smaller than 5 MB.'); const path = '/pdfjs/pdf.mjs'; const pdf = await import(/* @vite-ignore */ path) as typeof import('pdfjs-dist'); pdf.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs'; const loading = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, standardFontDataUrl: '/pdfjs/standard_fonts/', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true }); loading.onPassword = () => { void loading.destroy(); }; let doc; try {
    doc = await loading.promise;
    if (doc.numPages > 60)
        throw Error('Choose a syllabus with 60 pages or fewer.');
    let text = '';
    for (let n = 1; n <= doc.numPages; n++) {
        progress(`Reading page ${n} of ${doc.numPages}…`);
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        let previousY: number | null = null;
        for (const item of content.items) {
            if (!('str' in item))
                continue;
            const y = item.transform[5];
            if (previousY !== null && Math.abs(y - previousY) > 3)
                text += '\n';
            text += item.str + (item.hasEOL ? '\n' : ' ');
            previousY = item.hasEOL ? null : y;
        }
        text += '\n';
        if (text.length > 100000)
            throw Error('This file contains too much text. Paste smaller sections instead.');
    }
    if (text.replace(/\s/g, '').length < 20)
        throw Error('No selectable text found. This may be a scanned PDF. Paste its text or add deadlines manually.');
    return text;
}
finally {
    await doc?.destroy();
} }
