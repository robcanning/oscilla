// OSC receiver for Oscilla Score
(
s.waitForBoot {
    // Replace this with the port Oscilla is sending to
    var oscPort = 57120;

    // Create a responder for /rotate/uidXYZ
    OSCdef(\rotate, { |msg, time, addr, recvPort|
        var path = msg[0];
        var id = path.asString.split($/).last;
        var angle = msg[1];
        var radians = msg[2];
        var norm = msg[3];

        ("[ROTATE] " ++ id ++ ": " ++ angle ++ "°  (" ++ radians ++ " rad, " ++ norm ++ ")").postln;
    }, '/rotate');

    // Responder for /position/uidXYZ
    OSCdef(\position, { |msg|
        var path = msg[0];
        var id = path.asString.split($/).last;
        var x = msg[1];
        var y = msg[2];
        var xnorm = msg[3];
        var ynorm = msg[4];

        ("[POSITION] " ++ id ++ ": x=" ++ x ++ ", y=" ++ y ++ " (norm: " ++ xnorm ++ ", " ++ ynorm ++ ")").postln;
    }, '/position');

    // Responder for /cue/uidXYZ
    OSCdef(\cue, { |msg|
        var path = msg[0];
        var id = path.asString.split($/).last;
        var value = msg[1];
        ("[CUE] " ++ id ++ " triggered → " ++ value).postln;
    }, '/cue');

    NetAddr.langPort = oscPort;  // Make sure SuperCollider listens on the expected port
    "✅ OSC listeners ready on port %\n".format(oscPort).post;
};
)
