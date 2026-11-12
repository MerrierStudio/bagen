(function () {
  'use strict';
  let context, active = [], generation = 0;
  const tin = new Audio('./audio/TinOpen.m4a');
  tin.preload = 'none';
  window.BagenAudio = {
    unlock: function () { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; try { if (!context) context = new C(); context.resume().catch(function () {}); } catch (_) {} },
    play: async function (kind) {
      const epoch = generation;
      if (kind === 'tin') { tin.pause(); tin.currentTime = 0; await tin.play(); if (epoch !== generation) { tin.pause(); return '播放请求已取消'; } return '开盒音已请求播放，请记录实际听感'; }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw Error('浏览器无可用 Web Audio');
      if (!context) context = new AudioContext();
      await context.resume();
      if (epoch !== generation) return '音频请求已取消';
      const count = Math.floor(22050 * (kind === 'snap' ? 0.13 : 0.065));
      const buffer = context.createBuffer(1, count, 22050), samples = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) {
        const t = i / 22050;
        samples[i] = (kind === 'snap' ? Math.random() * 2 - 1 : Math.sin(t * 2400 + Math.sin(t * 330) * 3)) * Math.exp(-t * (kind === 'snap' ? 45 : 65)) * (kind === 'snap' ? 12000 : 1600) / 32768;
      }
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
      active.push(source); source.onended = function () { active = active.filter(s => s !== source); }; source.start();
      return '程序音已请求播放，请记录实际听感';
    },
    stop: function () { generation++; tin.pause(); active.forEach(s => { try { s.stop(); } catch (_) {} }); active = []; if (context) context.suspend().catch(function () {}); }
  };
})();
