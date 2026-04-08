import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';

export async function checkForUpdates(silent = false): Promise<void> {
  try {
    const update = await check();
    if (update) {
      console.log(`Update available: ${update.version}`);
      const yes = await ask(
        `Phiên bản mới ${update.version} đã có.\nBạn có muốn cập nhật không?`,
        { title: 'Cập nhật', kind: 'info', okLabel: 'Cập nhật', cancelLabel: 'Để sau' }
      );
      if (yes) {
        try {
          let downloaded = 0;
          let contentLength = 0;
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case 'Started':
                contentLength = event.data.contentLength ?? 0;
                console.log(`Download started, size: ${contentLength}`);
                break;
              case 'Progress':
                downloaded += event.data.chunkLength;
                console.log(`Downloaded ${downloaded}/${contentLength}`);
                break;
              case 'Finished':
                console.log('Download finished');
                break;
            }
          });
          console.log('Update installed, relaunching...');
          await relaunch();
        } catch (installErr) {
          console.error('Install failed:', installErr);
          await message(`Cập nhật thất bại: ${installErr}`, { title: 'Lỗi cập nhật', kind: 'error' });
        }
      }
    } else {
      console.log('No update available');
      if (!silent) {
        await message('Bạn đang dùng phiên bản mới nhất.', { title: 'Cập nhật', kind: 'info' });
      }
    }
  } catch (err) {
    console.error('Update check failed:', err);
    if (!silent) {
      await message(`Không thể kiểm tra cập nhật: ${err}`, { title: 'Lỗi', kind: 'error' });
    }
  }
}
