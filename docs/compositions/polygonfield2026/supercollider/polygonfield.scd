(
// =====================================================
// OSCILLA + GREYHOLE — COMPLETE FILE (DEG + SCALE FIX)
// =====================================================

// -----------------------------------------------------
// SERVER SETUP
// -----------------------------------------------------
s.options.sampleRate = 48000;
s.options.numOutputBusChannels = 2;
s.options.memSize = 2.pow(20);

// -----------------------------------------------------
// BOOT
// -----------------------------------------------------
s.waitForBoot({

    OSCdef.trace(false);

    // -------------------------------------------------
    // DEFAULT PITCH SYSTEM
    // -------------------------------------------------
	~oscScale = Scale.major;   // default scale
	~oscRoot = 24;          // base register
	~oscOctaveOffset = 0;   // (optional global transpose)

    // -------------------------------------------------
    // BUSES
    // -------------------------------------------------
    ~oscDryBus = Bus.audio(s, 2);
    ~oscRevBus = Bus.audio(s, 2);

    // -------------------------------------------------
    // GROUPS
    // -------------------------------------------------
    ~oscVoiceGroup   = Group.head(s);
    ~oscReverbGroup  = Group.after(~oscVoiceGroup);
    ~oscMonitorGroup = Group.after(~oscReverbGroup);

    // =================================================
    // SYNTHDEFS
    // =================================================

    SynthDef(\oscillaVoice, {
        |out=0, revBus=0, send=0.4,
         pitch=0.5, env=0.2, bright=0.5, density=0.3|

        var freq, sig, ampEnv;
        var numPartials, detuneSpread;
        var partials, driftRates, driftDepths, pans;

        // pitch is always 0..1 here
        freq = pitch.linexp(0, 1, 60, 2000);

        ampEnv = EnvGen.kr(
            Env.linen(
                0.05,
                env.linlin(0, 1, 0.4, 3.5),
                env.linlin(0, 1, 0.6, 4.5),
                1
            ),
            doneAction: 2
        );

        numPartials   = density.linlin(0, 1, 3, 7).round(1);
        detuneSpread = bright.linlin(0, 1, 0.2, 12);

        driftRates  = Array.fill(7, { Rand(0.03, 0.25) });
        driftDepths = Array.fill(7, { Rand(0.1, 1.0) });
        pans        = Array.fill(7, { Rand(-0.7, 0.7) });

        partials = Mix.fill(7, { |i|
            var active, detune, drift, f, amp;

            active = (i < numPartials);
            detune = Rand(-1, 1) * detuneSpread;

            drift = LFNoise2.kr(driftRates[i])
                .range(driftDepths[i].neg, driftDepths[i]);

            f = freq + detune + drift;
            amp = (1 / (i + 1)) * active;

            Pan2.ar(SinOsc.ar(f, 0, amp), pans[i]);
        });

        sig = partials
            * density.linlin(0, 1, 0.15, 0.6)
            * ampEnv;

        Out.ar(out, sig);
        Out.ar(revBus, sig * send);
    }).add;

    // -------------------------------------------------
    // GREYHOLE REVERB
    // -------------------------------------------------
    SynthDef(\greyhole2, {
        |inBus, outBus,
         level=0.45, delayTime=1.4, damp=0,
         size=2.3, diff=0.7, feedback=0.82,
         modDepth=0.2, modFreq=0.6,
         hpf=150, lpf=6000|

        var in, wet;

        in = In.ar(inBus, 2);
        wet = Greyhole.ar(
            in, delayTime, damp, size,
            diff, feedback, modDepth, modFreq
        );

        wet = HPF.ar(wet, hpf);
        wet = LPF.ar(wet, lpf);

        Out.ar(outBus, wet * level);
    }).add;

    SynthDef(\oscMonitor, {
        |inBus, out=0, level=0.35|
        Out.ar(out, In.ar(inBus, 2) * level);
    }).add;

    // -------------------------------------------------
    // START FX + MONITOR
    // -------------------------------------------------
    ~oscReverb = Synth(\greyhole2, [
        \inBus, ~oscRevBus,
        \outBus, ~oscDryBus,
        \level, 0.45
    ], ~oscReverbGroup);

    ~oscMonitor = Synth(\oscMonitor, [
        \inBus, ~oscDryBus,
        \level, 0.35
    ], ~oscMonitorGroup);

    // =================================================
    // OSC INPUT — DEG / HZ / CONTROL PITCH
    // =================================================
   // =================================================
// OSC INPUT — POSITIONAL FORMAT
// =================================================
OSCdef(\pontalist, { |msg|
    var pitchType, pitchA, pitchB;
    var size, env, density;

    var pitch01, freqHz;
    var pitchHz, pitchCtrl;
    var pitchDeg, pitchOct;

    // scale + tuning vars
    var scale, root, offset;
    var degreeIndex, octaveSteps, midi;

    // optional override root from cue
    var incomingRoot;

    if (msg.size < 7) {
        ("[OSC] ⚠ unexpected message: " ++ msg).postln;
        ^nil;
    };

    pitchType = msg[1];
    pitchA    = msg[2];
    pitchB    = msg[3];
    size      = msg[4];
    env       = msg[5];
    density   = msg[6];

    // optional 7th positional argument
    incomingRoot = if(msg.size > 7) { msg[7] } { nil };

    // -----------------------------------------
    // Pitch decoding
    // -----------------------------------------
    switch(pitchType,

        // -----------------------------------
        // 1) degree + octave
        // -----------------------------------
        1, {
            pitchDeg = pitchA;
            pitchOct = pitchB;

            scale  = (~oscScale ? Scale.major);
            offset = (~oscOctaveOffset ? 0);

            // if cue specifies root, use it — else fall back to global
            root = if(incomingRoot.notNil) {
                incomingRoot
            } {
                (~oscRoot ? 0)
            };

            // wrap degree + propagate overflow into octaves
            degreeIndex = pitchDeg % scale.degrees.size;
            octaveSteps = (pitchDeg / scale.degrees.size).floor;

            midi =
                root
                + ((pitchOct + offset + octaveSteps) * 12)
                + scale.degrees[degreeIndex];

            freqHz = midi.midicps;
        },

        // 2) hz
        2, {
            freqHz = pitchA;
        },

        // 3) midi
        3, {
            freqHz = pitchA.midicps;
        },

        // 4) y-normalized control
        4, {
            pitchCtrl = pitchA.clip(0, 1);
            freqHz = pitchCtrl.linexp(0, 1, 60, 2000);
        },

        // fallback
        {
            freqHz = 220;
        }
    );

    // -----------------------------------------
    // Normalize 0..1
    // -----------------------------------------
    pitch01 = freqHz.explin(60, 2000, 0, 1).clip(0, 1);

    env     = env.clip(0, 1);
    density = density.clip(0, 1);
    size    = size.clip(0, 1);

    [
        \pitchType, pitchType,
        \deg, pitchDeg,
        \oct, pitchOct,
        \root, (incomingRoot ?? { ~oscRoot }),
        \freqHz, freqHz.round(0.1)
    ].postln;

    Synth(\oscillaVoice, [
        \pitch, pitch01,
        \env, env,
        \bright, size,
        \density, density,
        \out, ~oscDryBus,
        \revBus, ~oscRevBus,
        \send, density.linlin(0, 1, 0.2, 0.75)
    ], ~oscVoiceGroup);

}, '/oscilla/pontalist');





    "=== OSCILLA SYSTEM READY ===".postln;
});
)



