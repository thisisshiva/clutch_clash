import { socketClient } from '../net/SocketClient.js';
import { attachVoice } from './SpatialAudio.js';

const RTC_CONFIG = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

/**
 * WebRTC mesh voice chat with proximity audio.
 * Signaling flows through Socket.io ('voice:signal'); each remote peer's
 * audio stream is attached to their car mesh as PositionalAudio, so voice
 * gets louder as cars get closer.
 */
export class VoiceManager {
  /**
   * @param {THREE.AudioListener} listener
   * @param {(peerId: string) => THREE.Object3D|null} getCarForPeer
   */
  constructor(listener, getCarForPeer) {
    this.listener = listener;
    this.getCarForPeer = getCarForPeer;
    this.localStream = null;
    this.muted = false;
    this.active = false;
    /** @type {Map<string, {pc: RTCPeerConnection, detach: (() => void)|null, pendingStream: MediaStream|null}>} */
    this.peers = new Map();
    this._unsubs = [];
  }

  async start() {
    if (this.active) return true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return false; // mic denied / unavailable
    }
    this.active = true;

    this._unsubs.push(
      socketClient.on('voice:signal', (msg) => this._onSignal(msg)),
      socketClient.on('voice:peerJoined', ({ id }) => this._connectTo(id, true)),
      socketClient.on('voice:peerLeft', ({ id }) => this._closePeer(id)),
    );
    // Announce ourselves; existing voice members will wait for our offer,
    // and we get told about them via peerJoined broadcast on their side.
    socketClient.emit('voice:join');
    return true;
  }

  /** Call when a new remote player appears in the room (we initiate). */
  connectToPeer(peerId) {
    if (!this.active || this.peers.has(peerId)) return;
    this._connectTo(peerId, true);
  }

  async _connectTo(peerId, initiator) {
    if (this.peers.has(peerId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, detach: null, pendingStream: null };
    this.peers.set(peerId, entry);

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketClient.emit('voice:signal', { to: peerId, data: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      entry.pendingStream = e.streams[0];
      this._tryAttach(peerId);
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        this._closePeer(peerId);
      }
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketClient.emit('voice:signal', { to: peerId, data: { sdp: pc.localDescription } });
    }
  }

  async _onSignal({ from, data }) {
    if (!this.active) return;
    let entry = this.peers.get(from);
    if (!entry) {
      await this._connectTo(from, false);
      entry = this.peers.get(from);
    }
    const { pc } = entry;

    try {
      if (data.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketClient.emit('voice:signal', { to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.warn('[voice] signaling error', err);
    }
  }

  /**
   * Attach the peer's audio to their car if it exists yet; called again from
   * update() until the car mesh is available.
   */
  _tryAttach(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry?.pendingStream || entry.detach) return;
    const car = this.getCarForPeer(peerId);
    if (!car) return;
    entry.detach = attachVoice(this.listener, car, entry.pendingStream);
  }

  /** Call periodically (e.g. each frame) to attach late-arriving car meshes. */
  update() {
    if (!this.active) return;
    for (const peerId of this.peers.keys()) this._tryAttach(peerId);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) track.enabled = !muted;
    }
  }

  _closePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.detach?.();
    entry.pc.close();
    this.peers.delete(peerId);
  }

  stop() {
    if (!this.active) return;
    socketClient.emit('voice:leave');
    for (const peerId of [...this.peers.keys()]) this._closePeer(peerId);
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.active = false;
  }
}
