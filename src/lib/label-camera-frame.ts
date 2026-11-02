export type Size = { width: number; height: number };
export type Rect = Size & { x: number; y: number };

export function labelFrame(preview: Size, shape: 'tall' | 'wide'): Rect {
  const aspect = shape === 'tall' ? 0.72 : 1.65;
  const width = Math.min(preview.width * 0.86, preview.height * 0.76 * aspect);
  const height = width / aspect;
  return { x: (preview.width - width) / 2, y: (preview.height - height) / 2, width, height };
}

// Camera photos are processed to match the preview, but can retain a different
// aspect ratio. Map the visible, center-cropped preview to the source image.
export function frameCrop(photo: Size, preview: Size, frame: Rect) {
  if ([photo.width, photo.height, preview.width, preview.height, frame.width, frame.height].some((n) => !Number.isFinite(n) || n <= 0)) throw new Error('Camera frame is not ready. Please retry.');
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  const visibleWidth = preview.width / scale;
  const visibleHeight = preview.height / scale;
  const left = (photo.width - visibleWidth) / 2;
  const top = (photo.height - visibleHeight) / 2;
  const originX = Math.max(0, Math.floor(left + frame.x / scale));
  const originY = Math.max(0, Math.floor(top + frame.y / scale));
  return { originX, originY, width: Math.min(photo.width - originX, Math.ceil(frame.width / scale)), height: Math.min(photo.height - originY, Math.ceil(frame.height / scale)) };
}
