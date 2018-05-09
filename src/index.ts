import app from './App';

const env = process.env.NODE_ENV || 'development';
const port = process.env.NODE_PORT || 3000;
const base_url = process.env.BASE_URL || '192.168.1.210';

app.listen(port, base_url, (err) => {
  if (err) {
    return console.log(err);
  }

  return console.log(`server is listening on ${base_url}:${port} in ${env} environment`);
});