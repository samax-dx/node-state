const { createMachine, interpret } = require('xstate');

const express = require('express');
const axios = require('axios').default;
const app = express();
const port = 3005;


app.use(express.json());


const RestMachine = createMachine({
    id: "smRestMachine",
    context: {
        data: null,
        error: null,
    },
    states: {
        noQuery: {},
        hasQuery: {},
        loading: {
            invoke: {
                src: "runQuery",
                onDone: { target: "hasResult", actions: ["setResult"] },
                onError: { target: "hasError", actions: ["setError"] }
            }
        },
        hasResult: {},
        hasError: {}
    },
    on: {
        "LOAD": { target: "loading" }
    },
    initial: "noQuery"
}, {
    services: {
        runQuery: async () => {
            return await axios.get("http://localhost:5000/category");
        }
    },
    actions: {
        setResult: (ctx, ev) => { ctx.data = ev.data.data; },
        setError: (ctx, ev) => { ctx.data = ev.data.toJSON(); },
    }
});
const restMachine = interpret(RestMachine);
setTimeout(() => restMachine.start(), 0);

app.get('/', (req, res) => {
    res.send({
        state: restMachine.state.value,
        data: restMachine.state.context.data,
        error: restMachine.state.context.error
    });
});

app.post('/send', (req, res) => {
    restMachine.send({ type: req.body.event.toUpperCase() });
    res.send({ sate: restMachine.state.value });
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});
