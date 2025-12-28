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
~oscRoot  = 0;             // C0 (8.1758 Hz)
~oscOctaveOffset = 0;      // musical mapping: 3 ≈ middle C

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
    OSCdef(\pontalist, { |msg|
        var dict;
        var pitchHz, pitchCtrl, pitchDeg, pitchOct;
        var pitch01, freqHz;
        var env, bright, density;

        // Build key–value dictionary
        dict = Dictionary.new;
        msg.copyRange(1, msg.size-1).clump(2).do { |pair|
            if(pair.size == 2) {
                dict[pair[0].asSymbol] = pair[1];
            }
        };

        pitchHz   = dict[\pitchHz];
        pitchCtrl = dict[\pitchCtrl];
        pitchDeg  = dict[\pitchDeg];
        pitchOct  = dict[\pitchOct];

        // -----------------------------------------
        // Pitch resolution (priority-based)
        // -----------------------------------------
    // -----------------------------------------
// Pitch resolution (priority-based)
// -----------------------------------------
if (pitchDeg.notNil and: pitchOct.notNil) {
    var scOct;

    // -------------------------------------
    // Musical octave mapping
    //
    // pitchOct = 0 → very low register
    // pitchOct = 3 → around middle C
    // pitchOct = 4 → one octave above
    // -------------------------------------
    scOct = pitchOct + ~oscOctaveOffset;

    freqHz = ~oscScale.degreeToFreq(
        pitchDeg,
        scOct,
        ~oscRoot.midicps
    );

} {
    if (pitchHz.notNil) {
        freqHz = pitchHz;
    } {
        pitch01 = (pitchCtrl ? 0.5).clip(0, 1);
        freqHz  = pitch01.linexp(0, 1, 60, 2000);
    };
};


        // Convert Hz → 0..1 for synth
        pitch01 = freqHz.explin(60, 2000, 0, 1).clip(0, 1);

        env     = (dict[\env]     ? 0.2).clip(0, 1);
        bright  = (dict[\bright]  ? 0.5).clip(0, 1);
        density = (dict[\density] ? 0.3).clip(0, 1);

        // -----------------------------------------
        // Diagnostic log
        // -----------------------------------------
        [
            \pitchDeg, pitchDeg,
            \pitchOct, pitchOct,
            \pitchHz, pitchHz,
            \pitchCtrl, pitchCtrl,
            \freqHz, freqHz.round(0.1)
        ].postln;

        Synth(\oscillaVoice, [
            \pitch, pitch01,
            \env, env,
            \bright, bright,
            \density, density,
            \out, ~oscDryBus,
            \revBus, ~oscRevBus,
            \send, density.linlin(0, 1, 0.2, 0.75)
        ], ~oscVoiceGroup);

    }, '/oscilla/pontalist');

    "=== OSCILLA SYSTEM READY ===".postln;
});
)
