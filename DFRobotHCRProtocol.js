

const SerialPort = require('serialport');
var SerialPortName;

SerialPort.list(function (err, ports) {
  ports.forEach(function(port) {
    if (String(port.manufacturer).includes('Arduino')) {
      SerialPortName=String(port.comName) ;
    }
  });
  console.log(SerialPortName);

  serialPort = new SerialPort(SerialPortName, {
    parser: SerialPort.parsers.raw,
    baudRate: 115200,
    autoOpen: false
  });

  serialPort.open(function (error) {
    if ( error ) {
      console.log('failed to open: '+error);
    } else {
      console.log('connected');

      setTimeout(function () {
        onConnectedCallback();
      }, 1000);

    }
  });

  serialPort.on('data', function(data) {
    // console.log('receivedBuffer:');
    // console.log(data.toString('hex'));

    // receivedBuffer = Buffer.concat([receivedBuffer,data])

    for (var k = 0; k < data.length; k++) {
      if (process(data[k])) {
        switch (getCommand()) {
          case COMMAND_ULTRASONIC_DISTANCE:
            var contentValue0 = [];
            for (var j = 0; j < getLength(); j+=2) {
              contentValue0.push(getContent().readInt16BE(j));
            }
            requestUltrasonicDistanceCallback(contentValue0);
          break;
          case COMMAND_INFRARED_DISTANCE:
            var contentValue1 = [];
            for (var j = 0; j < getLength(); j+=2) {
              contentValue1.push(getContent().readInt16BE(j));
            }
            requestInfraredDistanceCallback(contentValue1);
          break;
          case COMMAND_BUMPER:
            var contentValue2 = [];
            for (var j = 0; j < 3; j++) {
              contentValue2.push((getContent()[0] & (1<<j)) == (1<<j));
            }
            requestBumperCallback(contentValue2);
          break;
          case COMMAND_ANTI_DROP:
            var contentValue3 = [];
            for (var j = 0; j < 4; j++) {
              contentValue3.push((getContent()[0] & (1<<j))== (1<<j));
            }
            requestAntiDropCallback(contentValue3);
          break;
          default:
            break;
        }
      }
    }



  });


});



const RECEIVE_STACK_SIZE=20;
const TRANSMIT_STACK_SIZE=20;

const STACK_HEADER_55=0;
const STACK_HEADER_AA=1;
const STACK_ADDRESS=2;
const STACK_LENGTH=3;
const STACK_COMMAND=4;
const STACK_CONTENT=5;

const HEADER_55=0x55;
const HEADER_AA=0xaa;

var _receiveStack = new Buffer(RECEIVE_STACK_SIZE);
var _transmitStack = new Buffer(TRANSMIT_STACK_SIZE);

_transmitStack[STACK_HEADER_55] = HEADER_55;
_transmitStack[STACK_HEADER_AA] = HEADER_AA;
_receiveStack[STACK_HEADER_55] = HEADER_55;
_receiveStack[STACK_HEADER_AA] = HEADER_AA;

var _receiveIndex = 0;

/////////



function sender(address, command){
  _transmitStack[STACK_ADDRESS] = address;
  _transmitStack[STACK_COMMAND] = command;

  var stackSumIndex=_transmitStack[STACK_LENGTH]+STACK_CONTENT;

  _transmitStack[stackSumIndex]=0;

  //calculate the checksum
  for (var i=0; i< stackSumIndex; i++) {
    _transmitStack[stackSumIndex]+=_transmitStack[i];
  }

  transmit(_transmitStack, stackSumIndex+1);
}

function send(address, command, content0, content1, content2){
  switch (arguments.length) {
    case 2:
    _transmitStack[STACK_LENGTH] = 0;
    sender(address,command);
    break;
    case 3:
    _transmitStack[STACK_LENGTH] = 1;
    _transmitStack[STACK_CONTENT] = content0;
    sender(address,command);
    break;
    case 4:
    _transmitStack[STACK_LENGTH] = 2;
    _transmitStack[STACK_CONTENT] = content0;
    _transmitStack[STACK_CONTENT+1] = content1;
    sender(address,command);
    break;
    case 5:
    _transmitStack[STACK_LENGTH] = 3;
    _transmitStack[STACK_CONTENT] = content0;
    _transmitStack[STACK_CONTENT+1] = content1;
    _transmitStack[STACK_CONTENT+2] = content2;
    sender(address,command);
    break;
    default:
  }
}

function validateCheckSum(){
  const stackSumIndex=_receiveStack[STACK_LENGTH]+STACK_CONTENT;
  var sum = 0;

  //calculate the checksum
  for (var i=0; i< stackSumIndex; i++) {
    sum+=_receiveStack[i];
  }
  sum = sum & 0xff;

  if (sum == _receiveStack[stackSumIndex]) {
    return true;
  }
  else {
    return false;
  }
}


function process(recieveByte){
  if (_receiveIndex) {
    //is receiving
    if (_receiveIndex==STACK_HEADER_AA) {
      if (recieveByte!=HEADER_AA) {
        _receiveIndex=0;
        return false;
      }
    }

    if (_receiveIndex<=STACK_LENGTH) {
      _receiveStack[_receiveIndex++]=recieveByte;
    }
    else{
      if (_receiveStack[STACK_LENGTH]<=(RECEIVE_STACK_SIZE-STACK_CONTENT)) {
        _receiveStack[_receiveIndex++]=recieveByte;
        if (_receiveIndex==_receiveStack[STACK_LENGTH]+STACK_CONTENT+1) {
          if (validateCheckSum()) {
            _receiveIndex=0;
            return true;
          }
          else{
            _receiveIndex=0;
            return false;
          }
        }
      }
      else{
        _receiveIndex=0;
        return false;
      }
    }
  }
  else{
    //is not receiving
    if (recieveByte==HEADER_55) {
      _receiveIndex++;
    }
  }
  return false;
}


function getAddress(){
  return _receiveStack[STACK_ADDRESS];
}

function getLength(){
  return _receiveStack[STACK_LENGTH];
}

function getCommand(){
  return _receiveStack[STACK_COMMAND];
}

function getContent(){
  return _receiveStack.slice(STACK_CONTENT, STACK_CONTENT + 1 + 2*getLength());
}

/////////

function constrain(amt, low, high) {
  return ((amt)<(low)?(low):((amt)>(high)?(high):(amt)));
}

const COMMAND_MOTOR_POWER_PERCENT=0x01
const COMMAND_MOTOR_SPEED_PERCENT=0x02
const COMMAND_MOTOR_SPEED=0x03
const COMMAND_MOTOR_ROTATION=0x04

const COMMAND_BUMPER=0x11
const COMMAND_INFRARED_DISTANCE=0x12
const COMMAND_ULTRASONIC_DISTANCE=0x13
const COMMAND_COMPASS=0x14
const COMMAND_WHEEL_SPEED=0x15
const COMMAND_TEMPERATURE_HUMIDITY=0x16
const COMMAND_ANTI_DROP=0x17
const COMMAND_PID=0x21

const COMMAND_TIME_OUT=0xff

const CONTENT_CLOCK=0x00
const CONTENT_ANTI_CLOCK=0x01

var _address = 0x01;

function transmit(stack, length) {
  var buffer = Buffer(stack.slice(0,length));
  serialPort.write(buffer, function(err, results) {
    if (!err) {
      console.log('write:');
      console.log(buffer.toString('hex'));
    }
    else {
      console.log('err ' + err);
      console.log('results ' + results);
    }
  });
}


var requestUltrasonicDistanceCallback;


var requestInfraredDistanceCallback;


var requestAntiDropCallback;







var onConnectedCallback;

function DFRobotHCRProtocol(callback) {

  onConnectedCallback = callback;

  this.setMotorSpeed = function (left, right) {
    left=constrain(left, -255, 255);
    right=constrain(right, -255, 255);

    send(_address, COMMAND_MOTOR_SPEED, ((left>=0)?0x00:0x01)|((right>=0)?0x00:0x10), (left>=0)?left:-left,(right>=0)?right:-right);
  }

  this.requestBumper = function (callback) {
    send(_address, COMMAND_BUMPER, 0xff);
    requestBumperCallback = callback;
  }

  this.requestAntiDrop = function (callback){
    send(_address, COMMAND_ANTI_DROP, 0xff);
    requestAntiDropCallback = callback;
  }

  this.requestInfraredDistance = function (callback) {
    send(_address,COMMAND_INFRARED_DISTANCE,0xff);
    requestInfraredDistanceCallback = callback;
  }

  this.requestUltrasonicDistance = function(callback) {
    send(_address, COMMAND_ULTRASONIC_DISTANCE, 0xff);
    requestUltrasonicDistanceCallback = callback;
  }
}

module.exports = DFRobotHCRProtocol;
