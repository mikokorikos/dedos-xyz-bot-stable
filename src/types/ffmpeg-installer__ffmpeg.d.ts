/* eslint-disable import/no-default-export */

declare module '@ffmpeg-installer/ffmpeg' {
  export interface FfmpegInstallerModule {
    path: string;
    version: string;
  }

  const installer: FfmpegInstallerModule;
  export default installer;
  export const path: string;
  export const version: string;
}
