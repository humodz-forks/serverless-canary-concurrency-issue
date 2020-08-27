
module.exports.hello = async (event) => {
  console.log(event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello World! v4' }),
  };
};
