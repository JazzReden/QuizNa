import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaperCamera } from "../src/components/teacher/PaperCamera";
let play: ReturnType<typeof vi.spyOn>;
beforeEach(() => { play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());
const stream = {} as MediaStream;
it("waits for live frames, captures the video, and prevents duplicate capture while reading", () => {
  const onCapture = vi.fn(), props = {stream, busy:false, error:"", onClose:vi.fn(), onCapture, onUpload:vi.fn()};
  const {rerender} = render(<PaperCamera {...props} />);
  const video = screen.getByLabelText('Live answer sheet camera') as HTMLVideoElement;
  const button = screen.getByRole('button', {name:'Capture sheet'}) as HTMLButtonElement;
  expect(video.srcObject).toBe(stream); expect(video.playsInline).toBe(true); expect(video.controls).toBe(false);
  expect(button.disabled).toBe(true); fireEvent.playing(video); expect(button.disabled).toBe(false);
  fireEvent.click(button); expect(onCapture).toHaveBeenCalledWith(video);
  rerender(<PaperCamera {...props} busy />); expect(button.disabled).toBe(true);
  fireEvent.click(button); expect(onCapture).toHaveBeenCalledTimes(1);
});
it("shows scan errors in the camera, supports retry, and blocks closing while processing", () => {
  const onClose = vi.fn(),props = {stream,busy:false,error:'QR not found. Try again.',onClose,onCapture:vi.fn(),onUpload:vi.fn()};
  const {rerender}=render(<PaperCamera {...props} />);
  expect(screen.getByRole('alert').textContent).toContain('QR not found');
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'}); expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<PaperCamera {...props} busy />);
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'}); expect(onClose).toHaveBeenCalledTimes(1);
});
it("locks page scrolling, traps keyboard focus, and restores focus on close", () => {
  const opener=document.createElement('button');document.body.append(opener);opener.focus();
  const {unmount}=render(<PaperCamera stream={stream} busy={false} error="" onClose={vi.fn()} onCapture={vi.fn()} onUpload={vi.fn()} />);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Tab'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close camera'}));
  unmount();expect(document.body.style.overflow).toBe('');expect(document.activeElement).toBe(opener);opener.remove();
});
it("offers a preview retry when the browser blocks playback", async () => {
  play.mockRejectedValueOnce(new Error('Playback blocked'));
  render(<PaperCamera stream={stream} busy={false} error="" onClose={vi.fn()} onCapture={vi.fn()} onUpload={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button',{name:'Start preview'}));expect(play).toHaveBeenCalledTimes(2);
});
