export interface CaptureSession {
  id: string;
  windowTitle: string;
  windowApp?: string;
  intervalSec: number;
  startedAt: string;
  endedAt?: string;
}

export interface WindowInfo {
  id: number;
  title: string;
  appName: string;
  thumbnail?: string;
}
