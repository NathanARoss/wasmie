function testKeyFuncs() {
  function testGetNextKey(...levels) {
    const key1 = Uint8Array.from(levels);
    const nextKey1 = Script.getNextKey(key1);
    console.log("[", ...key1, "]++ == [", ...nextKey1, "]");
  }
    
  function testGetAvgKey(key1, key2) {
    const lowKey = Uint8Array.from(key1);
    const highKey = Uint8Array.from(key2);
    const avgKey = Script.getAvgKey(lowKey, highKey);
    console.log("avg of [", ...lowKey, "] and [", ...highKey, "] is [", ...avgKey, "]");

    // const avgKeyExp = Script.getAvgKeyExp(lowKey, highKey);
    // if (avgKey.length !== avgKeyExp.length
    //   || avgKey.some((val, i) => val !== avgKeyExp[i])) {
    //     console.log("experimental version produced [", ...avgKeyExp, "]");
    // }
  }

  console.log("getNextKey() tests")
  testGetNextKey(1);
  testGetNextKey(3, 4, 5, 1);
  testGetNextKey(255, 255, 254, 1);
  testGetNextKey(255, 255, 255);

  console.log("");
  console.log("getAvgKey() tests")
  testGetAvgKey([2, 32], [2, 64]);
  testGetAvgKey([1, 32], [2, 32]);
  testGetAvgKey([2], [2, 0, 0, 1]);
  testGetAvgKey([2, 255, 254], [2, 255, 255]);
  testGetAvgKey([2, 255, 255], [3]);
  testGetAvgKey([2, 255, 255], [4]);
  testGetAvgKey([2, 255, 255], [2, 255, 255]);
}

(async function testAwait() {
  const input = document.getElementById("console-input");
  input.onkeydown = function(event) {
    if (event.key === "Enter") {
      if (event.target.onsubmit) {
        event.target.onsubmit(event);
      }
    }
  }

  // function getInt() {
  //   return new Promise(resolve => {
  //     input.onsubmit = function(event) {
  //       print(event.target.value + "\n")
  //       const int = event.target.value|0;
  //       event.target.value = "";
  //       resolve(int);
  //     }
  //   });
  // }

  // print("Enter four numbers:\n");
  // const num1 = await getInt();
  // const num2 = await getInt();
  // const num3 = await getInt();
  // const num4 = await getInt();
  // const sum = num1 + num2 + num3 + num4;
  // print("The sum is " + sum + "\n");

  // while (true) {
  //   print("You are awesome!\n");
  //   await sleep(1000);
  // }

  function sleep(milliseconds) {
    return new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    });
  }

  async function sleepyFibb(n) {
      await sleep(10);
  
      if (n <= 1) {
        return (1);
      } else {
        return (await sleepyFibb(n - 1) + await sleepyFibb(n - 2));
      }
  }

  const fib = await sleepyFibb(10);
  print("10th fib number is " + fib + "\n")
})