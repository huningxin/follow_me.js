// License: Apache 2.0. See LICENSE file in root directory.
// Copyright(c) 2016 Intel Corporation. All Rights Reserved.

'use strict';

let os = require('os');
let jpeg = require('jpeg-turbo');
let express = require('express');
let app = express();
let server = require('http').createServer(app);
let WsServer = require('ws').Server;

let mraa = require('mraa'); //require mraa
let ptModule = require('node-person'); //require person-tracking
const DFRobotHCRProtocol = require('./DFRobotHCRProtocol');

// var speed = 20; // cm/s

var block = false;
let hcr = new DFRobotHCRProtocol(function () {
  console.log("On HCR System ready");

  setTimeout(function loop () {
    if(block)
    {
      return;
    }

    var ultraforward = 100000;
    hcr.requestUltrasonicDistance(function (results) {
      //console.log('requestUltrasonicDistance: (cm)');
      //console.log(results);
      var rightForward  = results[0];
      var rightBackward = results[1];
      var backward      = results[2];
      var leftBackward  = results[3];
      var leftForward   = results[4];
      var forward       = results[5];
      ultraforward = forward;
   });

    hcr.requestInfraredDistance(function (results) {
      var rightForward  = results[0];
      var rightBackward = results[1];
      var leftBackward  = results[2];
      var leftForward   = results[3];
      var forward       = results[4];

      function obstacle(isleft)
      {
          var aSpeed = -1;
          if(isleft)
          {
            aSpeed = 1;
          }
          console.log('obstacle: set aSpeed: ' + aSpeed);
          move(0,aSpeed);
          setTimeout(function () {
           move(0, 0);
           setTimeout(function() {
             move(60,0);
             console.log('obstacle: set lSpeed: ' + 60);
             setTimeout(function () {
               move(0, 0);
               setTimeout(function() {
                 console.log('obstacle: set aSpeed: ' + -aSpeed);
                 //move(0,-aSpeed/2);
                 let s = 15;
                 hcr.setMotorSpeed(s, -s);
                 block = false;
                 console.log('UNBLOCKED!!!');
                 setTimeout(loop, 500);
               }, 500);
             }, 2000);
           }, 500);
          }, 1300);
      }

      let forwardMax = 500;
      let angularMax = 200;

      if((forward <= forwardMax && ultraforward <= forwardMax/10) || rightForward <= angularMax || leftForward <= angularMax)
      {
        //console.log('requestInfraredDistance: (mm)');
        //console.log(results);
        console.log('forward: ' + forward + ' ultraforward: ' + ultraforward);

        block = true;
        console.log('BLOCKED!!!');
        brake();
        console.log('STOP!!!');
        setTimeout(function() {
          obstacle(true);
          /*
          if(rightForward >= angularMax) 
          {
            obstacle(false);
          }
          else if(leftForward >= angularMax)
          {
            obstacle(true);
          }
          else
          {
            obstacle(true);
          }
*/
        }, 1000);
      }
    });

    hcr.requestAntiDrop(function (results) {
      ////console.log('requestAntiDrop:');
      ////console.log(results);
      var isRightForwardTriggered   = results[0];
      var isRightBackwardTriggered  = results[1];
      var isLeftBackwardTriggered   = results[2];
      var isLeftForwardTriggered    = results[3];
    });

    hcr.requestBumper(function (results) {
      ////console.log('requestBumper:');
      ////console.log(results);
      var isLeftForwardTriggered    = results[0];
      var isForwardTriggered        = results[1];
      var isRightForwardTriggered   = results[2];
    });

    setTimeout(loop, 100);
  }, 100);
});

//console.log('MRAA Version: ' + mraa.getVersion()); //write the mraa version to the console

// Disable the blink LED functionality
//let led = new mraa.Gpio(27); //Corresponding to ISH_GPIO4
//led.dir(mraa.DIR_OUT); //set the gpio direction to output
let ledState = true; //Boolean to hold the state of Led
let intervalId = null;

function startBlinkLed() {
  if (intervalId !== null)
    return;
  intervalId = setInterval(() => {
   // led.write(ledState?1:0); //if ledState is true then write a '1' (high) otherwise write a '0' (low)
    ledState = !ledState; //invert the ledState
  }, 100);
}

function stopBlinkLed() {
  if (intervalId === null)
    return;
  clearInterval(intervalId);
  intervalId = null;
  //led.write(0);
}

let ptConfig = {tracking: {enable: true, trackingMode: 'following'}};
let cameraConfig = {color: {width: 320, height: 240, frameRate: 30, isEnabled: true},
                    depth: {width: 320, height: 240, frameRate: 30, isEnabled: true}};
let pt;

ptModule.createPersonTracker(ptConfig, cameraConfig).then((instance) => {
  pt = instance;
  //console.log('Enabling Tracking with mode set to 0');
  startServer();
  pt.on('frameprocessed', function(result) {
    pt.getFrameData().then((frame) => {
      sendRgbFrame(frame);
    });
    checkPersonDetected(result);
  });
  pt.on('persontracked', function(result) {
    startTracking(result);
    sendTrackingData(result);
    updateSpeed(result);
  });

  return pt.start();
}).catch((error) => {
  //console.log('error: ' + error);
});

//console.log('\n-------- Press Esc key to exit --------\n');

const ESC_KEY = '\u001b';
const CTRL_C = '\u0003';
let stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
stdin.on('data', function(key) {
  if (key === ESC_KEY || key === CTRL_C) {
    exit();
  }
});

function exit() {
  //console.log('\n-------- Stopping --------');
  if (pt) {
    pt.stop().then(() => {
      process.exit();
    }).catch((error) => {
      //console.log('error: ' + error);
      process.exit();
    });
  } else {
    process.exit();
  }
}

let personDetected = false;
function checkPersonDetected(result) {
  if (result.persons.length > 0) {
    if (!personDetected) {
      //console.log('Person is detected, blink LED...');
      personDetected = true;
      //startBlinkLed();
    }
  } else {
    if (personDetected) {
      //console.log('No person is detected, stop blinking...');
      personDetected = false;
      //stopBlinkLed();
      brake();
    }
  }
}

let trackingPersonId;

function startTracking(result) {
  if (pt.state === 'detecting' && result.persons.length > 0) {
    // Start tracking the first person detected in the frame.
    //console.log('Call StartTracking()');
    trackingPersonId = result.persons[0].trackInfo.id;
    pt.personTracking.startTrackingPerson(trackingPersonId);
  }
}

function padding(string, width) {
  if (!(string instanceof String))
    string = String(string);
  let length = width - string.length;
  if (length <= 0) return string;
  return string + new Array(length + 1).join(' ');
}

function sendTrackingData(result) {
  if (!connected) {
    return;
  }
  let persons = result.persons;
  if (persons.length > 0) {
    let personData = null;
    persons.forEach(function(person) {
      if (person.trackInfo.id === trackingPersonId)
        personData = person;
    });
  
    if (personData === null)
      return;
    let resultArray = [];
    let trackInfo = personData.trackInfo;
    if (trackInfo) {
      let element = {};
      let boundingBox = trackInfo.boundingBox;
      let center = trackInfo.center;
      element.pid = trackInfo.id;
      if (boundingBox) {
        element.person_bounding_box = {
          x: boundingBox.rect.x,
          y: boundingBox.rect.y,
          w: boundingBox.rect.width,
          h: boundingBox.rect.height,
        };
      }
      if (center) {
        element.center_mass_image = {
          x: center.imageCoordinate.x,
          y: center.imageCoordinate.x,
        };
        element.center_mass_world = {
          x: center.worldCoordinate.x,
          y: center.worldCoordinate.y,
          z: center.worldCoordinate.z,
        };
      }
      resultArray.push(element);
    }
    let resultToDisplay = {
      Object_result: resultArray,
      type: 'person_tracking',
    };
    sendData(JSON.stringify(resultToDisplay));
  }
}

function sendRgbFrame(frame) {
  if (!connected) {
    return;
  }
  let useJpeg = true;
  let width = frame.color.width;
  let height = frame.color.height;
  let rawData = frame.color.data;

  let imageBuffer;
  let imageBufferLength;
  if (useJpeg) {
    imageBuffer = encodeToJPEG(rawData, width, height);
    imageBufferLength = imageBuffer.byteLength;
  } else {
    imageBuffer = rawData;
    imageBufferLength = rawData.length;
  }

  const msgHeaderLength = 16;
  let msg = new ArrayBuffer(msgHeaderLength + imageBufferLength);
  let int8View = new Uint8Array(msg);
  int8View.set(imageBuffer, msgHeaderLength);

  let int16View = new Uint16Array(msg, 0, msgHeaderLength);
  const MSG_RGB = 3;
  const FrameFormat = {
    Raw: 0,
    Jpeg: 1,
  };

  // The schema of the sent message:
  // |type|format|width|height|padding|time|data|
  // type: 1 byte, 3 means RGB frame data
  // format: 1 byte, 0 means raw data with out encoding, 1 means jpeg
  // width: 2 bytes, width of the frame data
  // height: 2 bytes, height of the frame data
  // padding: 2 bytes
  // time: 8 bytes, time stamp, not used currently.
  // data: the RGB data.
  int8View[0] = MSG_RGB;  // type
  if (useJpeg)
    int8View[1] = FrameFormat.Jpeg;  // format, jpeg
  else
    int8View[1] = FrameFormat.Raw;  // format, raw
  int16View[1] = width;
  int16View[2] = height;
  int16View[3] = 0;  // padding

  sendData(msg);
}

let clients = [];
let connected = false;

function sendData(data) {
  if (clients.length !== 0) {
    try {
      clients.forEach((client) => {
        client.send(data);
      });
    } catch (exception) {
      //console.log('Exception: send data failed exception:', exception);
    }
  }
}

function encodeToJPEG(buffer, width, height) {
  let options = {
    format: jpeg.FORMAT_RGB,
    width: width,
    height: height,
    quality: 80,
  };
  let jpegImageData = jpeg.compressSync(buffer, options);
  return jpegImageData;
}

function getEthernetIp() {
  let ifaces = os.networkInterfaces();
  let ip = '';
  for (let ifname in ifaces) {
    if (ifname === undefined)
      continue;
    ifaces[ifname].forEach(function(iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        return;
      }
      ip = iface.address;
    });
    if (ip !== '')
      return ip;
  }
  return ip;
}

let axe0, axe1, pressed0, pressed1;
let stopped = true;
let following = false;

function handleGamepadMessage(controller) {
  let newPressed0= controller.buttons[0].pressed;
  if (pressed0 != newPressed0) {
    pressed0 = newPressed0;
    if (pressed0) {
      stopped = !stopped;
      if (stopped) {
        //console.log('stopped');
        brake();
      } else {
        //console.log('started');
      }
    } 
  }

  let newPressed1= controller.buttons[1].pressed;
  if (pressed1 != newPressed1) {
    pressed1 = newPressed1;
    if (pressed1) {
      following = !following;
      if (following) {
        //console.log('following');
      } else {
        //console.log('no-following');
      }
    } 
  }

  let newAxe0 = Math.floor(controller.axes[0] * 10) / 10;
  let newAxe1 = Math.floor(controller.axes[1] * 10) / 10;
  if (axe0 != newAxe0 || axe1 != newAxe1) {
    axe0 = newAxe0;
    axe1 = newAxe1;
    if (!stopped) {
      if (axe1 <= 0) axe0 = -axe0;
      move(-axe1/2, axe0);
    }
  }
}

const centerX = 0;
const centerY = 0;
const centerZ = 1.3;
const linearStep = 0.01;
const linearMax = 0.6;

let prevTimestamp = 0;
let linear = 0;

function updateSpeed(result) {
  if (!following)
    return;

  if (block)
    return;
  // control 10 FPS
  /*
  if (prevTimestamp === 0) {
    prevTimestamp = Date.now();
  } else {
    let diff = Date.now() - prevTimestamp;
    if (diff < 100)
      return;
    prevTimestamp = Date.now();
  }
  */

  // find the tracking person
  let persons = result.persons;
  if (persons.length > 0) {
    let personData = null;
    persons.forEach(function(person) {
      if (person.trackInfo.id === trackingPersonId)
        personData = person;
    });
    if (personData === null)
      return;
    let trackInfo = personData.trackInfo;
    if (trackInfo) {
      let center = trackInfo.center;
      if (center) {
        let x = center.worldCoordinate.x;
        let y = center.worldCoordinate.y;
        let z = center.worldCoordinate.z;
        let angular = 0;
        if (Math.abs(x - centerX) > 0.1) {
          angular = Math.atan2(centerX - x, z);
          angular *= 180 / Math.PI;
          angular /= 10;
        }

        let target = z - centerZ;
        if (Math.abs(target) > 0.1) {
          if (Math.abs(linear) < Math.abs(target)) {
            if (target > 0)
              linear += linearStep;
            else
              linear -= linearStep;
          } else if (Math.abs(linear) > Math.abs(target)) {
            if (target > 0)
              linear -= linearStep;
            else
              linear += linearStep;
          }
        } else {
          if (Math.abs(linear - 0) > 0.05)
            if (linear > 0)
              linear -= 5*linearStep;
            else
              linear += 5*linearStep;
          else
            linear = 0;
        } 

        if (linear > linearMax) linear = linearMax;
        else if (linear < -linearMax) linear = -linearMax;
        angular = Math.floor(angular * 10) / 10;
        
        move(linear, angular);
      }
    }
  }
}

function handleFollowMessage(enable) {
  if (enable) {
    //console.log('enable follow');
    following = true;
    stopped = false;
  } else {
    //console.log('disable follow');
    brake();
    following = false;
    stopped = true;
  }
}

function startServer() {
  // Share the ui-browser code from cpp sample
  app.use(express.static('client'));
  const ip = getEthernetIp();
  const port = 8000;
  server.listen(port, ip);
  let wss = new WsServer({
    server: server,
  });

  console.log('\nEthernet ip:' + ip);
  console.log(' >>> point your browser to: http://' + ip + ':' + port + '/view.html');

  wss.on('connection', function(client) {
    console.log('server: got connection ' + client._socket.remoteAddress + ':' +
        client._socket.remotePort);
    clients.push(client);
    if (!connected)
      connected = true;
    client.on('close', function() {
      console.log('server: disconnect ' + client._socket.remoteAddress + ':' +
          client._socket.remotePort);
      let index = clients.indexOf(client);
      if (index > -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0)
        connected = false;
    });

    client.on('message', function(message) {
      if (message instanceof Buffer) {
      } else {
        let msgObject = JSON.parse(message);
        if (msgObject.type === 'gamepad') {
          handleGamepadMessage(msgObject.body);
        } else if (msgObject.type === 'follow') {
          handleFollowMessage(msgObject.body);
        } else {
          //console.log('unkonwn message type: ' + msgObject.type);
        }
      }
    });
  });
}

function brake() {
  hcr.setMotorSpeed(0,0);
}

function move(linear, angular) {
  if (!stopped) {
    linear *= 100;
    angular *= 10;
    //console.log('set speed: ' + linear + ', ' + angular);
    var LSpeed = linear - (angular * 105)/67.5;
    var RSpeed = linear + (angular * 105)/67.5;
    hcr.setMotorSpeed(LSpeed, RSpeed);
  }
}
