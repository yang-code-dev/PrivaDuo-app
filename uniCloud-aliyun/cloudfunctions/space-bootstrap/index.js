'use strict';

exports.main = async (event, context) => {
  return {
    ok: true,
    service: 'space-bootstrap',
    provider: 'aliyun',
    now: Date.now(),
    event,
  };
};
