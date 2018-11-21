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

function testNamesArrayEntries() {
  const testArr = [
    this.one = 1,
    this.two = 2,
    this.three = 3,
    this.four = 4,
  ];

  console.log(this.one, this.two, this.three, this.four, testArr);
}