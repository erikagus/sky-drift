// On-screen flight controls for phones and tablets: a thumb stick on the left,
// DROP and BOOST buttons on the right. They press the same virtual keys the keyboard does,
// so the flight code does not need to know the difference.

export function createTouchControls({ keys, onDrop }) {
  const root = document.getElementById("touch-ui");
  const stick = document.getElementById("touch-stick");
  const knob = document.getElementById("touch-knob");
  const dropBtn = document.getElementById("touch-drop");
  const boostBtn = document.getElementById("touch-boost");

  const RADIUS = 54;
  const DEAD_ZONE = 0.28;
  let stickPointer = null;
  let centerX = 0;
  let centerY = 0;

  const press = (code, on) => (on ? keys.add(code) : keys.delete(code));

  function steer(dx, dy) {
    press("KeyA", dx < -DEAD_ZONE);
    press("KeyD", dx > DEAD_ZONE);
    press("KeyW", dy < -DEAD_ZONE);
    press("KeyS", dy > DEAD_ZONE);
    knob.style.transform = `translate(${dx * RADIUS}px, ${dy * RADIUS}px)`;
  }

  function moveStick(e) {
    let dx = (e.clientX - centerX) / RADIUS;
    let dy = (e.clientY - centerY) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    steer(dx, dy);
  }

  function releaseStick() {
    stickPointer = null;
    steer(0, 0);
  }

  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const rect = stick.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    moveStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickPointer) moveStick(e);
  });
  for (const type of ["pointerup", "pointercancel"]) {
    stick.addEventListener(type, (e) => {
      if (e.pointerId === stickPointer) releaseStick();
    });
  }

  dropBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onDrop();
  });

  boostBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    boostBtn.setPointerCapture(e.pointerId);
    keys.add("Space");
  });
  for (const type of ["pointerup", "pointercancel"]) {
    boostBtn.addEventListener(type, () => keys.delete("Space"));
  }

  return {
    setVisible(visible) {
      root.style.display = visible ? "block" : "none";
      if (!visible) {
        releaseStick();
        keys.delete("Space");
      }
    },
  };
}
