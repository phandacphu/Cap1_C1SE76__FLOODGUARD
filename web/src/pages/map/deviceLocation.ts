export interface DeviceFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type DeviceLocationState = {
  status: 'locating' | 'ready' | 'error' | 'stale';
  fix: DeviceFix | null;
  message: string;
};

export const MAX_FIX_AGE = 60_000;

export function validDeviceFix(
  position: GeolocationPosition,
  now = Date.now(),
): DeviceFix | null {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    ![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    accuracy < 0 || position.timestamp > now + 5_000 ||
    now - position.timestamp > MAX_FIX_AGE
  ) return null;
  return { latitude, longitude, accuracy, timestamp: position.timestamp };
}

export function watchDeviceLocation(
  geo: Geolocation,
  publish: (state: DeviceLocationState) => void,
  now = Date.now,
): () => void {
  let disposed = false;
  let blocked = false;
  let latest: DeviceFix | null = null;
  let stale = false;
  let pending = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const recover = () => {
    if (disposed || blocked || pending || retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      if (disposed || blocked) return;
      pending = true;
      try {
        geo.getCurrentPosition(position => {
          pending = false;
          accept(position);
        }, error => {
          pending = false;
          fail(error);
        }, {
          enableHighAccuracy: false,
          maximumAge: 15_000,
          timeout: 20_000,
        });
      } catch {
        pending = false;
        if (!disposed && !blocked) recover();
      }
    }, 15_000);
  };

  const accept = (position: GeolocationPosition) => {
    if (disposed || blocked) return;
    const fix = validDeviceFix(position, now());
    if (!fix || (latest && fix.timestamp < latest.timestamp)) {
      recover();
      return;
    }
    latest = fix;
    stale = false;
    clearTimeout(retry);
    retry = undefined;
    publish({ status: 'ready', fix, message: '' });
  };

  const fail = (error: GeolocationPositionError) => {
    if (disposed || blocked) return;
    if (error.code === 1) {
      blocked = true;
      latest = null;
      clearTimeout(retry);
      retry = undefined;
      publish({
        status: 'error',
        fix: null,
        message: 'Quyền định vị bị từ chối. Hãy cho phép Vị trí trong Chrome và macOS, rồi tải lại trang.',
      });
      return;
    }

    stale = true;
    publish({
      status: latest ? 'stale' : 'error',
      fix: latest,
      message: latest
        ? 'Đang hiển thị vị trí lần cuối, chưa xác nhận vị trí hiện tại. Đang tự thử lại.'
        : 'Thiết bị chưa lấy được vị trí. Đang tự thử lại; hãy kiểm tra dịch vụ định vị của máy.',
    });
    recover();
  };

  const id = geo.watchPosition(accept, fail, {
    enableHighAccuracy: true,
    maximumAge: 15_000,
    timeout: 20_000,
  });

  const timer = setInterval(() => {
    if (disposed || blocked) return;
    if (latest && now() - latest.timestamp > MAX_FIX_AGE) {
      if (!stale) {
        stale = true;
        publish({
          status: 'stale',
          fix: latest,
          message: 'Vị trí lần cuối đã quá 60 giây; chưa xác nhận vị trí hiện tại. Đang tự thử lại.',
        });
      }
      recover();
    }
  }, 5_000);

  return () => {
    disposed = true;
    clearInterval(timer);
    clearTimeout(retry);
    geo.clearWatch(id);
  };
}
