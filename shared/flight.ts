import { Quaternion, Vector3 } from "three";
import type { AircraftDef } from "./config";
import { clamp, DEFAULT_THROTTLE } from "./config";
import type { Controls, FlightState } from "./types";

const localForward = new Vector3();
const axis = new Vector3();
const dq = new Quaternion();
const yAxis = new Vector3(0, 1, 0);
const rightVec = new Vector3();
const upVec = new Vector3();
const LEVEL_ROLL_GAIN = 0.5;
const LEVEL_PITCH_GAIN = 0.5;

function cruiseSpeed(def: AircraftDef): number {
  return def.minSpeed + (def.maxSpeed - def.minSpeed) * DEFAULT_THROTTLE;
}

export function createFlightState(x: number, y: number, z: number, yaw: number, def?: AircraftDef): FlightState {
  const q = new Quaternion().setFromAxisAngle(yAxis, yaw);
  return {
    x, y, z,
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    speed: def ? cruiseSpeed(def) : 25,
    boost: 100,
    throttle: DEFAULT_THROTTLE,
  };
}

export function flightForward(state: FlightState, out = localForward): Vector3 {
  out.set(0, 0, -1);
  const q = new Quaternion(state.qx, state.qy, state.qz, state.qw);
  out.applyQuaternion(q);
  return out;
}

export function getQuaternion(state: FlightState, out = new Quaternion()): Quaternion {
  return out.set(state.qx, state.qy, state.qz, state.qw);
}

export function integrateFlight(state: FlightState, def: AircraftDef, controls: Controls, dt: number): void {
  const throttle = clamp(controls.throttle, 0.15, 1);
  state.throttle = throttle;
  const pitch = clamp(controls.pitch, -1, 1);
  const roll = clamp(controls.roll, -1, 1);
  const yaw = clamp(controls.yaw, -1, 1);

  const boosting = controls.boost && state.boost > 0.5;
  if (boosting) state.boost = Math.max(0, state.boost - 31 * dt);
  else state.boost = Math.min(100, state.boost + 17 * dt);

  const targetSpeed = def.minSpeed + (def.maxSpeed - def.minSpeed) * throttle + (boosting ? def.boostSpeed - def.maxSpeed : 0);
  const turnLoad = Math.abs(pitch) * 0.09 + Math.abs(roll) * 0.03 + Math.abs(yaw) * 0.035;
  const diff = targetSpeed - state.speed;
  state.speed = clamp(state.speed + clamp(diff, -def.acceleration * dt, def.acceleration * dt) - state.speed * turnLoad * dt, 1.2, def.boostSpeed * 1.08);

  const speedFactor = clamp(state.speed / def.maxSpeed, 0.38, 1.3);
  const lowSpeed = 1 - clamp(state.speed / def.maxSpeed, 0, 1);
  const turnAssist = 2.1 + lowSpeed * 1.2;
  const q = new Quaternion(state.qx, state.qy, state.qz, state.qw);
  const pitchRate = def.pitchRate * speedFactor * turnAssist;
  const rollRate = def.rollRate * clamp(speedFactor, 0.55, 1.2) * (1.3 + lowSpeed * 0.6);
  const yawRate = def.yawRate * speedFactor * turnAssist;

  if (controls.autoLevelPitch) {
    localForward.set(0, 0, -1).applyQuaternion(q);
    const climb = Math.asin(clamp(localForward.y, -1, 1));
    const levelPitch = clamp(-climb * LEVEL_PITCH_GAIN, -1, 1);
    if (Math.abs(levelPitch) > 0.001) {
      axis.set(1, 0, 0);
      q.multiply(dq.setFromAxisAngle(axis, levelPitch * pitchRate * dt));
    }
  } else if (Math.abs(pitch) > 0.001) {
    axis.set(1, 0, 0);
    q.multiply(dq.setFromAxisAngle(axis, pitch * pitchRate * dt));
  }
  if (controls.autoLevelRoll) {
    rightVec.set(1, 0, 0).applyQuaternion(q);
    upVec.set(0, 1, 0).applyQuaternion(q);
    const bank = Math.atan2(rightVec.y, upVec.y);
    const levelRoll = clamp(bank * LEVEL_ROLL_GAIN, -1, 1);
    if (Math.abs(levelRoll) > 0.001) {
      axis.set(0, 0, 1);
      q.multiply(dq.setFromAxisAngle(axis, -levelRoll * rollRate * dt));
    }
  } else if (Math.abs(roll) > 0.001) {
    axis.set(0, 0, 1);
    q.multiply(dq.setFromAxisAngle(axis, -roll * rollRate * dt));
  }
  rightVec.set(1, 0, 0).applyQuaternion(q);
  const coordinatedYaw = clamp(-rightVec.y * 1.15, -1, 1);
  const yawTotal = clamp(yaw + coordinatedYaw, -1.3, 1.3);
  if (Math.abs(yawTotal) > 0.001) {
    axis.set(0, 1, 0);
    q.multiply(dq.setFromAxisAngle(axis, -yawTotal * yawRate * dt));
  }
  q.normalize();
  state.qx = q.x;
  state.qy = q.y;
  state.qz = q.z;
  state.qw = q.w;

  localForward.set(0, 0, -1).applyQuaternion(q);
  state.x += localForward.x * state.speed * dt;
  state.y += localForward.y * state.speed * dt;
  state.z += localForward.z * state.speed * dt;
}

export function reverseFlightDirection(state: FlightState): void {
  const q = new Quaternion(state.qx, state.qy, state.qz, state.qw);
  q.multiply(new Quaternion().setFromAxisAngle(yAxis, Math.PI)).normalize();
  state.qx = q.x;
  state.qy = q.y;
  state.qz = q.z;
  state.qw = q.w;
}

export function respawnFlight(state: FlightState, x: number, y: number, z: number, yaw: number, def?: AircraftDef): void {
  const q = new Quaternion().setFromAxisAngle(yAxis, yaw);
  state.x = x;
  state.y = y;
  state.z = z;
  state.qx = q.x;
  state.qy = q.y;
  state.qz = q.z;
  state.qw = q.w;
  state.speed = def ? cruiseSpeed(def) : 25;
  state.boost = 100;
  state.throttle = DEFAULT_THROTTLE;
}
