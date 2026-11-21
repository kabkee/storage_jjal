// 움직이는 webp → GIF 변환 (브라우저에서, 누른 짤 하나만)
// 텔레그램은 GIF 는 바로 움짤로 보여주지만 webp 는 「파일」로만 보여준다. 그래서 「GIF 모드」일 때만 쓴다.
// 짤 전부를 미리 GIF 로 만들어 두면 349MB·8분 30초(2026-11-21 실측)라 저장소엔 webp 만 둔다.
//
// - 디코딩: WebCodecs ImageDecoder (Chrome·Edge, Firefox 133+). 보안 컨텍스트(https·localhost)에서만 있다.
// - 인코딩: gifenc. 프레임마다 256색 팔레트를 새로 뽑는다.
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export const canConvertToGif = () =>
    typeof window !== 'undefined' && 'ImageDecoder' in window && typeof OffscreenCanvas !== 'undefined';

const hasAlpha = (data) => {
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) return true;
    return false;
};

/**
 * @param {string} url 움직이는 webp 주소
 * @param {{ onProgress?: (ratio: number) => void }} [opts]
 * @returns {Promise<Blob>} image/gif
 */
export async function webpToGif(url, { onProgress } = {}) {
    if (!canConvertToGif()) throw new Error('이 브라우저는 GIF 변환을 지원하지 않아요');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`이미지를 받지 못했어요 (HTTP ${res.status})`);
    const type = (res.headers.get('content-type') || 'image/webp').split(';')[0].trim();
    const decoder = new ImageDecoder({ data: await res.arrayBuffer(), type });
    try {
        await decoder.tracks.ready;
        await decoder.completed;
        const count = decoder.tracks.selectedTrack?.frameCount || 1;
        const gif = GIFEncoder();
        let canvas, ctx;
        for (let i = 0; i < count; i++) {
            // ImageDecoder 는 앞 프레임과 합성이 끝난 「완성된 한 장」을 준다 → GIF 에도 통째로 넣는다
            const { image } = await decoder.decode({ frameIndex: i });
            const w = image.displayWidth, h = image.displayHeight;
            if (!canvas) {
                canvas = new OffscreenCanvas(w, h);
                ctx = canvas.getContext('2d', { willReadFrequently: true });
            }
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(image, 0, 0, w, h);
            const delay = Math.max(20, Math.round((image.duration ?? 100000) / 1000));   // µs → ms (너무 짧으면 뷰어가 느리게 틀어서 20ms 하한)
            image.close();

            const { data } = ctx.getImageData(0, 0, w, h);
            const alpha = hasAlpha(data);
            // rgb565 는 프레임당 ~100ms(300x447) 라 긴 움짤은 10초 넘게 걸린다 → rgb444(~15ms). GIF 256색이라 눈에 띄는 차이는 거의 없다
            const format = alpha ? 'rgba4444' : 'rgb444';
            const palette = quantize(data, 256, alpha ? { format, oneBitAlpha: true } : { format });
            const index = applyPalette(data, palette, format);
            const tIdx = alpha ? palette.findIndex(c => c[3] === 0) : -1;
            gif.writeFrame(index, w, h, {
                palette, delay, repeat: 0,
                ...(tIdx >= 0 ? { transparent: true, transparentIndex: tIdx, dispose: 2 } : {}),
            });
            onProgress?.((i + 1) / count);
            if (i % 3 === 2) await new Promise(r => setTimeout(r));   // 화면이 멈추지 않게 숨 돌리기
        }
        gif.finish();
        return new Blob([gif.bytes()], { type: 'image/gif' });
    } finally {
        decoder.close();
    }
}
