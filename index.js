const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const { gql, ApolloServerPluginDrainHttpServer } = require('apollo-server-core');
const { createMachine, interpret, assign } = require('xstate')
const { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');
const { xrValue, lnValue } = require("./xml-rpc-message-converter.js");


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

app.post('/ofbiz', (req, res) => {
    const xmlRpcUrl = "https://localhost:8443/webtools/control/xmlrpc";
    const strXmlVer = '<?xml version="1.0"?>';
    const xmlRpcPayload = strXmlVer + new XMLBuilder().build({
        methodCall: {
            methodName: "runService",
            params: [
                {
                    param: {
                        value: {
                            struct: {
                                member: [
                                    {
                                        name: "login.username",
                                        value: { string: "admin" }
                                    },
                                    {
                                        name: "login.password",
                                        value: { string: "ofbiz" }
                                    },
                                    {
                                        name: "method",
                                        value: { string: req.body.method }
                                    },
                                    {
                                        name: "args",
                                        value: xrValue(req.body.params)
                                    },
                                ],
                            }
                        }
                    }
                },
            ]
        }
    });
    const jsessionid = "7F7F9422CA86792B6A77677F97BB9099";
    const requestHeaders = {
        'Content-Type': 'text/xml',
        'Cookie': `JSESSIONID=${jsessionid}.jvm1`,
    };
    const insecureAgent = new https.Agent({ rejectUnauthorized: false });

    axios.post(
        xmlRpcUrl,
        xmlRpcPayload,
        { headers: requestHeaders, httpsAgent: insecureAgent }
    ).then(response => {
        var xrResponse = new XMLParser().parse(response.data);
console.log(JSON.stringify(xrResponse, null, 4));
        if (typeof xrResponse === "object") {
            if (xrResponse.html) {
                return void (res.sendStatus(503));
            }

            if (xrResponse.methodResponse.params) {
                const { value } = xrResponse.methodResponse.params.param;
                if (value) {
                    return void (res.send(lnValue(value)));
                }
            }
        }

        res.status(500).send({ error: "unknown error" });
    }).catch(error => {
        res.sendStatus(500);
    });
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
