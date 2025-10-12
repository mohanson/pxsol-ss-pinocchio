#![allow(unexpected_cfgs)]

use pinocchio::sysvars::Sysvar;

pinocchio::entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &pinocchio::pubkey::Pubkey,
    accounts: &[pinocchio::account_info::AccountInfo],
    data: &[u8],
) -> pinocchio::ProgramResult {
    let account_user = accounts[0];
    let account_data = accounts[1];

    let rent_exemption = pinocchio::sysvars::rent::Rent::get()?.minimum_balance(data.len());
    let bump_seed = &[pinocchio::pubkey::find_program_address(&[&account_user.key()[..]], program_id).1];
    let signer_seed = pinocchio::seeds!(account_user.key(), bump_seed);
    let signer = pinocchio::instruction::Signer::from(&signer_seed);

    // Data account is not initialized. Create an account and write data into it.
    if account_data.lamports() == 0 {
        pinocchio_system::instructions::CreateAccount {
            from: &account_user,
            to: &account_data,
            lamports: rent_exemption,
            space: data.len() as u64,
            owner: program_id,
        }
        .invoke_signed(&[signer])?;
        account_data.try_borrow_mut_data().unwrap().copy_from_slice(data);
        return Ok(());
    }

    // Fund the data account to let it rent exemption.
    if rent_exemption > account_data.lamports() {
        pinocchio_system::instructions::Transfer {
            from: &account_user,
            to: &account_data,
            lamports: rent_exemption - account_data.lamports(),
        }
        .invoke()?;
    }

    // Withdraw excess funds and return them to users. Since the funds in the pda account belong to the program, we do
    // not need to use instructions to transfer them here.
    if rent_exemption < account_data.lamports() {
        *account_user.try_borrow_mut_lamports().unwrap() += account_data.lamports() - rent_exemption;
        *account_data.try_borrow_mut_lamports().unwrap() = rent_exemption;
    }
    // Realloc space.
    account_data.resize(data.len())?;
    // Overwrite old data with new data.
    account_data.try_borrow_mut_data().unwrap().copy_from_slice(data);

    Ok(())
}
