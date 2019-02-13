#![no_std]

#![feature(alloc, core_intrinsics, lang_items, alloc_error_handler)]

extern crate alloc;
extern crate wee_alloc;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

//errors and panics abort
#[panic_handler]
#[no_mangle]
pub fn panic(_info: &::core::panic::PanicInfo) -> ! {
    unsafe {
        ::core::intrinsics::abort();
    }
}

#[alloc_error_handler]
#[no_mangle]
pub extern "C" fn oom(_: ::core::alloc::Layout) -> ! {
    unsafe {
        ::core::intrinsics::abort();
    }
}

extern {
    // fn puts(address: *const u8, size: usize);
    // fn putc(charcode: u32);
    // fn putnum(value: i32);
    fn logputs(address: *const u8, size: usize); 
}



// fn print(message: &str) {
//     unsafe {
//         puts(message.as_ptr(), message.len());
//     }
// }

fn log(message: &str) {
    unsafe {
        logputs(message.as_ptr(), message.len());
    }
}

#[no_mangle]
pub extern "C" fn start() {
    let message = "Hello World!\n";
    log(message);
}