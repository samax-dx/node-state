// xr = xml-rpc
// ln = language-native

// XML-RPC Message Converter

var xrValueType = valueLn => {
    if (typeof valueLn === "number") {
        return valueLn % 1 === 0 ? "i4" : "double";
    }
    if (typeof valueLn === "boolean") {
        return "Boolean";
    }
    if (typeof valueLn === "string") {
        return "string";
    }
    if (typeof valueLn === "object") {
        if (valueLn instanceof Date) {
            return "dateTime.iso8601";
        }
        if (Array.isArray(valueLn)) {
            return "array";
        }
        if (typeof valueLn !== "function") {
            return "struct";
        }
    }
    return false;
};

var xrValue = valueLn => {
    var valueType = xrValueType(valueLn);
    var valueData = valueLn;

    if (valueType === "struct") {
        return {
            struct: {
                member: [
                    ...Object.entries(valueData).map(([k, v]) => {
                        return {
                            name: k,
                            value: xrValue(v)
                        };
                    })
                ]
            }
        }
    } else if (valueType === "array") {
        return {
            array: {
                data: {
                    value: [
                        ...valueData.map(data => xrValue(data))
                    ]
                }
            }
        };
    } else if (valueType == false) {
        return valueData;
    } else {
        return { [valueType]: valueData };
    }
};

var lnValueType = valueXr => {
    if (typeof valueXr !== "object") return false;
    return Object.keys(valueXr)[0];
};

var lnValue = valueXr => {
    if (typeof valueXr === "object") {
        if (Array.isArray(valueXr)) {
            return valueXr.map(v => lnValue(v));
        } else {
            var valueType = lnValueType(valueXr);
            var valueData = valueXr;

            if (valueType === "struct") {
                return valueData["struct"]["member"].reduce((acc, v) => {
                    acc[v["name"]] = lnValue(v["value"]);
                    return acc;
                }, {});
            } else if (valueType === "array") {
                return valueData["array"]["data"]["value"].map(v => lnValue(v));
            } else if (valueType === "dateTime.iso8601") {
                return new Date(valueData[valueType]);
            } else {
                if (valueType) {
                    return valueData[valueType];
                } else {
                    return valueData;
                }
            }
        }
    } else {
        return valueXr;
    }
};


module.exports = {
    xrValue,
    lnValue,
};


// var inputLnValue = [
//     {
//         person: {
//             id: 1,
//             name: "shabbir",
//             orders: [
//                 { id: 91, title: "banana: 4x", value: 30 },
//                 { id: 92, title: "apple: 1x", value: 12.5 },
//                 { id: 92, title: "rice: 5x", value: 280 }
//             ]
//         }
//     },
//     new Date(Date.now())
// ];
// var xrOutputValue = xrValue(inputLnValue);
// console.log(JSON.stringify(xrOutputValue, null, 4));
// console.log(JSON.stringify(lnValue(xrOutputValue), null, 4));
