const Chrome = require('chrome-remote-interface');
const chromeLauncher = require('chrome-launcher');

async function launchChrome(headless = true) {
    return chromeLauncher.launch({
    });
}

async function monitorNetworkAndAPIs(chromeInstance, url) {
    const protocol = await Chrome({ port: chromeInstance.port });
    const { Network, Runtime, Performance } = protocol;

    await Promise.all([Network.enable(), Runtime.enable(), Performance.enable()]);

    Network.requestWillBeSent((params) => {
        console.log(`Network Request sent: ${params.request.url}`);
    });

    Network.responseReceived((params) => {
        console.log(`Network Response received: ${params.response.url} - ${params.response.status}`);
    });

    Runtime.consoleAPICalled(({ args, type }) => {
        console.log(`Console message: ${args.map(arg => arg.value).join(', ')}`);
    });

    Runtime.exceptionThrown(({ exceptionDetails }) => {
        console.error('Exception:', exceptionDetails.text, exceptionDetails.lineNumber);
    });

    // Inject a script to listen for certain browser API calls
    Runtime.evaluate({
        expression: `
            // Intercept Geolocation API
            if (navigator.geolocation) {
                const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
                navigator.geolocation.getCurrentPosition = function(...args) {
                    console.log('Geolocation getCurrentPosition called');
                    return originalGetCurrentPosition.apply(this, args);
                };
            }

            // Intercept DOM changes
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    console.log('DOM mutation:', mutation);
                });
            });
            observer.observe(document, { attributes: true, childList: true, subtree: true });

            // Intercept user interactions
            ['click', 'scroll', 'keydown'].forEach(eventType => {
                document.addEventListener(eventType, event => {
                    console.log('User interaction:', eventType, event);
                });
            });

            // Other API interceptions


        `,
        awaitPromise: true,
        userGesture: true
    });

    await protocol.Page.navigate({ url });
    await protocol.Page.loadEventFired();

    await new Promise((resolve) => setTimeout(resolve, 5000)); // Adjust the wait time as needed

    protocol.close();
    chromeInstance.kill();
}

async function run() {
    const url = 'http://localhost:8000/'
    try {
        const chrome = await launchChrome();
        await monitorNetworkAndAPIs(chrome, url);
    } catch (error) {
        console.error('Error during network and API monitoring:', error);
    }
}

run();
