module.exports = {
    'env': {
        'browser': true,
        'node': true,
        'es6': true,
        'jquery': true,
    },
    'extends': 'eslint:recommended',
    'parserOptions': {
        'ecmaVersion': 2017,
        'ecmaFeatures': {
            'jsx': true
        },
        'sourceType': 'module'
    },
    'rules': {
        'indent': [2, 4],
        'linebreak-style': [2, 'unix'],
        // 'quotes': [2, 'single'],
        'brace-style': [2, '1tbs'],
        'camelcase': [2, {'properties': 'never'}],
        'keyword-spacing': [2],
        'no-trailing-spaces': ['off'],
    },
    'globals': {
        enquire: false,
    }
};
