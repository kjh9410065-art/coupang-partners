/**
 * 상품 이미지 검증 전용 모듈입니다.
 *
 * 검색 결과에 섞일 수 있는 로고/아이콘/아바타 등의 이미지를 제외하고,
 * 실제 이미지 응답이며 상품 사진으로 사용하기에 적절한 후보만 통과시킵니다.
 */

/** 이미지 URL 검증에 사용하는 최소 조건입니다. */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 300;
const MIN_RATIO = 0.33;
const MAX_RATIO = 3;

/** 이미지 URL의 응답 헤더와 크기를 확인합니다. */
export async function validateImageUrl(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;

  // URL 자체에 로고/아이콘 등의 흔한 파일명이 포함되면 제외합니다.
  if (/logo|icon|sprite|avatar|favicon|badge|banner/i.test(url)) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-65535" },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return false;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) return false;

    // 실제 이미지 헤더를 읽어 최소한의 크기/비율을 검사합니다.
    const buffer = await response.arrayBuffer();
    const dimensions = readImageDimensions(new Uint8Array(buffer), contentType);
    if (!dimensions) return false;

    const { width, height } = dimensions;
    if (width < MIN_WIDTH || height < MIN_HEIGHT) return false;

    const ratio = width / height;
    return ratio >= MIN_RATIO && ratio <= MAX_RATIO;
  } catch {
    return false;
  }
}

/** PNG/JPEG/WebP/GIF의 기본 헤더에서 이미지 크기를 읽습니다. */
function readImageDimensions(bytes: Uint8Array, contentType: string): { width: number; height: number } | null {
  // PNG: 고정된 IHDR 위치에 가로/세로가 저장됩니다.
  if (contentType.includes("png") && bytes.length >= 24 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return {
      width: readUint32(bytes, 16),
      height: readUint32(bytes, 20),
    };
  }

  // GIF: 헤더 뒤 4바이트에 가로/세로가 저장됩니다.
  if (contentType.includes("gif") && bytes.length >= 10 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }

  // WebP: RIFF/WEBP 기본 헤더와 VP8X 확장 헤더를 지원합니다.
  if (contentType.includes("webp") && bytes.length >= 30 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
  }

  // JPEG는 SOF 마커까지 이동해 프레임 크기를 읽습니다.
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }

      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) return null;

      // SOF0~SOF3, SOF5~SOF7, SOF9~SOF11, SOF13~SOF15
      const isFrameMarker =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isFrameMarker) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }

      offset += length + 2;
    }
  }

  return null;
}

/** Uint8Array의 4바이트 Big Endian 값을 읽습니다. */
function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]) >>> 0;
}
