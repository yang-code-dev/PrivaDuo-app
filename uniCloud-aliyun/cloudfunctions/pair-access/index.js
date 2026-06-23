'use strict';

const db = uniCloud.database();

exports.main = async (event) => {
  const { pairId, uid } = event || {};

  if (!pairId || !uid) {
    return {
      ok: false,
      errMsg: 'pairId and uid are required',
    };
  }

  const { data } = await db.collection('couple_bind').doc(pairId).get();
  const pair = data && data[0];
  const ok = Boolean(pair && (pair.userAId === uid || pair.userBId === uid));

  return {
    ok,
    pairId,
    uid,
  };
};
