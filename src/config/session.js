const express = require('express');
const session = require('require-session');
const app = express();


app.use(session({
    secret: 'your-secret-key that will sign cookie',
    resave: false,
    saveUninitialized: false
}))

app.get('/', (req, res) => {
    console.log(req.session);
    res.send('Hello New Session');
});

app.listen(3001, () => {
    console.log('Server is running on port 3001');
});