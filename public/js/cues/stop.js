

export function handleStopCue(ast) {
  console.log("[cueStop] Triggered:", ast);
  /* Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /*  Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

  // Toggle playback:
  if (window.isPlaying) {
    // Use musical pause - transport/performance time continues
    window.isPlaying = false;
    window.isMusicalPause = true;
    window.animationPaused = true;
    window.stopAnimation?.();
    window.togglePlayButton?.();
    
    // Sync to server
    if (window.socket?.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "pause",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime
      }));
    }
  } else {
    window.startPlayback();
  }

  // Optional chaining: stop(next:nav(B))
  if (ast.next) {
    console.log(`[cueStop] Scheduling next cue: ${ast.next}`);
    setTimeout(() => {
      handleCueTrigger(ast.next, false, true);
    }, 50);
  }
}
