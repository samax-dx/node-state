const express = require('express');
const { createMachine, interpret } = require('xstate');
const app = express();
const port = 3005;

const RestMachine = createMachine({
    id: "smRestMachine",
    context: {
        data: null
    },
    states: {
        ideal: {
            on: {
                "HELLO": { target: "hello" }
            }
        },
        hello: {
            entry: (ctx, ev) => ctx.data = "hello world"
        }
    },
    initial: "ideal"
});
const restMachine = interpret(RestMachine);
setTimeout(() => restMachine.start(), 0);

app.get('/', (req, res) => {
    res.send(restMachine.state.toJSON());
});

app.post('/hello', (req, res) => {
    restMachine.send({ type: req.path.substring(1).toUpperCase() });
    res.send(restMachine.state.context.data);
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});
