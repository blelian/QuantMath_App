/**
 * Module Example
 * Demonstrates TypeScript features including classes, recursion, lists, async functions,
 * terminal output, and exception handling.
 */

// Class definition
class Calculator {
  numbers: number[];

  constructor(numbers: number[]) {
    this.numbers = numbers;
  }

  /**
   * Recursively calculates the sum of numbers in an array
   * @param nums Array of numbers
   * @returns Sum of numbers
   */
  sum(nums: number[] = this.numbers): number {
    if (nums.length === 0) return 0;
    return nums[0] + this.sum(nums.slice(1));
  }

  /**
   * Asynchronous method that multiplies numbers after a delay
   * @returns Promise<number>
   */
  async multiplyAll(): Promise<number> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = this.numbers.reduce((acc, num) => acc * num, 1);
        resolve(result);
      }, 1000);
    });
  }
}

/**
 * Function demonstrating exception handling
 * @param n Number to divide
 */
function divideBy(n: number) {
  try {
    if (n === 0) throw new Error("Cannot divide by zero!");
    console.log("100 divided by", n, "=", 100 / n);
  } catch (err) {
    console.error("Error caught:", (err as Error).message);
  }
}

/**
 * Main function to run the module
 */
export async function runModule() {
  console.log("=== Module Example Starting ===");

  // Using a class and list
  const calc = new Calculator([1, 2, 3, 4, 5]);
  console.log("Numbers:", calc.numbers);

  // Recursion
  const sum = calc.sum();
  console.log("Sum of numbers (recursion):", sum);

  // Async function
  const product = await calc.multiplyAll();
  console.log("Product of numbers (async):", product);

  // Exception handling
  divideBy(0);
  divideBy(5);

  console.log("=== Module Example Finished ===");
}
