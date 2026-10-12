'use strict';

// Head tracking: follows the phone's motion sensors. When there are none (a
// computer, or motion refused), a pretend head can be turned by dragging instead.
window.PVR = window.PVR || {};

(function (PVR) {
  const math = PVR.math;
  const WAIT_FOR_SENSOR = 1500; // ms before deciding no readings are coming

  function screenAngle() {
    if (typeof window.orientation === 'number') return window.orientation;
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return 0;
  }

  PVR.createTracking = function (onSensor) {
    let sensor = null;        // latest reading from the phone, as a quaternion
    let pretendYaw = 0;
    let pretendPitch = 0;
    let frontYaw = 0;         // which way "front" is, set by re-centring
    let centreOnNextReading = false;
    let timer = 0;

    function onOrientation(event) {
      if (event.alpha === null || event.beta === null || event.gamma === null) return;
      const first = !sensor;
      sensor = math.fromDeviceOrientation(event.alpha, event.beta, event.gamma, screenAngle());
      if (centreOnNextReading) {
        centreOnNextReading = false;
        frontYaw = math.yawOf(sensor);
      }
      if (first) {
        clearTimeout(timer);
        onSensor(true);
      }
    }

    const tracking = {
      start() {
        tracking.stop();
        centreOnNextReading = true;
        pretendYaw = pretendPitch = frontYaw = 0;
        window.addEventListener('deviceorientation', onOrientation);
        timer = setTimeout(() => { if (!sensor) onSensor(false); }, WAIT_FOR_SENSOR);
      },
      stop() {
        window.removeEventListener('deviceorientation', onOrientation);
        clearTimeout(timer);
        sensor = null;
      },
      hasSensor() { return !!sensor; },
      orientation() { return sensor || math.fromYawPitch(pretendYaw, pretendPitch); },
      frontYaw() { return frontYaw; },
      // Makes "front" the way the viewer is looking right now.
      recentre() { frontYaw = math.yawOf(tracking.orientation()); },
      setFront(yaw) { frontYaw = yaw; },
      // Turns the pretend head. Only has an effect while there is no sensor.
      look(yaw, pitch) {
        pretendYaw += yaw;
        pretendPitch = Math.max(-1.5, Math.min(1.5, pretendPitch + pitch));
      },
    };
    return tracking;
  };
})(window.PVR);
