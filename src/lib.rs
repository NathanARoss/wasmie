#![no_std]
#![feature(core_intrinsics, lang_items)]

//manually grow memory and manage the heap. No allocator needed
use core::arch::wasm32;
/* Using from this crate:
pub fn memory_grow(mem: u32, delta: usize) -> usize
pub fn memory_size(mem: u32) -> usize
*/

//errors and panics abort
#[panic_handler]
#[no_mangle]
pub fn panic(_info: &::core::panic::PanicInfo) -> ! {
    unsafe {
        ::core::intrinsics::abort();
    }
}

extern {
    fn puts(address: *const u8, size: usize);
    // fn putc(charcode: u32);
    fn putnum(value: i32);
}

fn print(message: &str) {
    unsafe {
        puts(message.as_ptr(), message.len());
    }
}

fn printnum(num: i32) {
    unsafe {
        putnum(num);
    }
}



// #[no_mangle]
// pub extern "C" fn get_string(choice: i32) -> &'static str {
//     if choice == 0 {
//         return "Zero\n";
//     } else {
//         return "Else branch\n";
//     }
// }

#[no_mangle]
pub extern "C" fn main(heap_base: u32) {
    //round up to multiple of 8 bytes
    let heap_base_alligned = (heap_base + 7) & !7;

    print("Heap base: ");
    printnum(heap_base as i32);

    print("Heap base aligned: ");
    printnum(heap_base_alligned as i32);
}