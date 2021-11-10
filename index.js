const http = require('http');
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const { gql, ApolloServerPluginDrainHttpServer } = require('apollo-server-core');
const { createMachine, interpret, assign } = require('xstate')

const R = require("ramda");
const axios = require('axios').default;

const rpcMethods = require('./rpcMethods');


const app = express();
const port = 3005;

const RestMachine = createMachine({
    initial: "noQuery",
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
        "LOAD": {
            target: "loading",
            actions: assign({
                query: (ctx, ev) => {
                    const ev_data = typeof ev.data === "object" ? ev.data : {};

                    const restActions = {
                        idEquals: id => `${id}`,
                        productNameContains: n => `productNameContains/${n}`,
                    };

                    const params = Object.keys(ev_data).map(
                        k => restActions[k] && restActions[k](ev_data[k])
                    );

                    return params.length ? `/${params.join("/")}` : "";
                }
            })
        }
    },
    context: {
        data: null,
        error: null,
    },
    id: "smRestMachine",
}, {
    services: {
        runQuery: async (ctx, ev) => {
            return await axios.get(`http://localhost:5000/category${ctx.query}`);
        }
    },
    actions: {
        setResult: (ctx, ev) => { ctx.data = ev.data.data; },
        setError: (ctx, ev) => { ctx.data = ev.data.toJSON(); },
    }
});
const restMachine = interpret(RestMachine);
setTimeout(() => restMachine.start(), 0);

app.use(cors(), express.json());

app.get('/', (req, res) => {
    res.send({
        state: restMachine.state.value,
        data: restMachine.state.context.data,
        error: restMachine.state.context.error
    });
});

app.post('/send', (req, res) => {
    restMachine.send({
        type: req.body.event.type.toUpperCase(),
        data: req.body.event.data
    });
    res.send({ sate: restMachine.state.value });
});

app.post('/eval', (req, res) => {
    const result = {}; console.log(req.body.methods);

    const resTapper = m => [rpcMethods[m], R.tap(data => result[m] = data)];
    const tappedMethods = req.body.methods.map(method => resTapper(method));
    const topMethodData = req.body.data;

    tappedMethods.unshift([_ => topMethodData, R.tap(v => result[v] = v)]);

    R.pipe(...tappedMethods.flat())(topMethodData); console.log(result);

    res.send(result);
});

const typeDefs = gql`
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  # This "Book" type defines the queryable fields for every book in our data source.
  type Book {
    title: String
    author: String
  }

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  type Query {
    books: [Book]
  }
`;

const books = [
    {
        title: 'The Awakening',
        author: 'Kate Chopin',
    },
    {
        title: 'City of Glass',
        author: 'Paul Auster',
    },
];

const resolvers = {
    Query: {
        books: () => books,
    },
};

async function startServer() {
    const httpServer = http.createServer(app);
    const gqlServer = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    });

    await gqlServer.start();
    app.use(gqlServer.getMiddleware({ path: "/gql" }));

    httpServer.listen({ host: "127.0.0.1", port }, () => {
        console.log(`express.js running at http://localhost:${port}/,\napollographql landing page http://localhost:${port}/gql`);
    });
}
startServer();
