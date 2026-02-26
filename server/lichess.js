async function getLichessAccountFromToken(token) {
  const cleaned = String(token || '').trim();
  if (!cleaned) {
    const err = new Error('Missing token');
    err.status = 400;
    throw err;
  }

  const res = await fetch('https://lichess.org/api/account', {
    headers: {
      Authorization: `Bearer ${cleaned}`,
    },
  });

  if (!res.ok) {
    const err = new Error('Invalid Lichess token');
    err.status = 400;
    throw err;
  }

  const data = await res.json();
  // data.username exists for /api/account
  if (!data || !data.username) {
    const err = new Error('Unexpected Lichess response');
    err.status = 502;
    throw err;
  }

  return {
    username: data.username,
  };
}

module.exports = {
  getLichessAccountFromToken,
};
