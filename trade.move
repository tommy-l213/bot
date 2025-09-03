module trade::trade{

    use std::object::{Self,Object};
    use aptos_std::fungible_asset::{Self,Metadata};
    use hyperion::router_v3;
    use hyperion::pool_v3::{Self,LiquidityPoolV3};
    use aptos_std::primary_fungible_store;
    use aptos_std::signer;

    use aptos_std::math64;


    const Rion :address = @0x435ad41e7b383cef98899c4e5a22c8dc88ab67b22f95e5663d6c6649298c3a9d;
    const Rion_pool:address =@0x1e94cf5b01113ad7f09add53df9d13c06d676352741fdd6637e1013c01e25c3e;

    const Slippage :u256 = 1;
    const GAS_min :u64 = 5000000;
   

    /// GAS not enough 
    const GAS_NOT_ENOUGH:u64 = 2;
   

    public entry fun swap_rion(swaper:&signer){
        for(i in 2..4){
            let rion_balance = primary_fungible_store::balance(signer::address_of(swaper),get_rion());
            let apt_balance= primary_fungible_store::balance(signer::address_of(swaper),get_apt());
            assert!(apt_balance >= GAS_min,GAS_NOT_ENOUGH);
            if(i%2 == 0){
                let slippage = get_slippage(get_apt(),apt_balance-GAS_min);
                router_v3::swap_batch(swaper,get_path_of_swap_pool(),get_apt(),get_rion(),apt_balance-GAS_min,slippage,signer::address_of(swaper));
                for_fee(swaper,get_rion(),primary_fungible_store::balance(signer::address_of(swaper),get_rion()));
            }else{
                let slippage = get_slippage(get_rion(),rion_balance);
                router_v3::swap_batch(swaper,get_path_of_swap_pool(),get_rion(),get_apt(),rion_balance,slippage,signer::address_of(swaper));
                for_fee(swaper,get_apt(),primary_fungible_store::balance(signer::address_of(swaper),get_apt())-GAS_min);
            }
        }
    }
    
    fun get_path_of_swap_pool():vector<address>{
        vector[Rion_pool]
    }

    fun get_pool():Object<LiquidityPoolV3>{
        object::address_to_object<LiquidityPoolV3>(Rion_pool)
    }


    fun get_slippage(meta:Object<Metadata>,num:u64):u64{
        let d =fungible_asset::decimals(meta) as u64;
        let one_unit =math64::pow(10, d);
        let (amount,_) = pool_v3::get_amount_out(get_pool(),meta,one_unit);
        let slippage = (amount as u256) * (num as u256)/(one_unit as u256);

        let slippage_amount = (slippage  as u256 ) * (100 - Slippage) /100;
        slippage_amount as u64
    }

    fun for_fee(swaper:&signer,meta:Object<Metadata>,amount:u64){
        let fee = if(meta== get_rion()){
            amount*1/1000
        }else{
            get_fee_bps()    
        };
        primary_fungible_store::transfer(swaper,meta,@hyperion_fee,fee)
    }
    
    fun get_rion():Object<Metadata>{
        object::address_to_object<Metadata>(Rion)
    }
    fun get_apt():Object<Metadata>{
        object::address_to_object<Metadata>(@0xa)
    }
    fun get_fee_bps():u64{
        100000
    }
    #[view]
    public fun get_balance(u:address):(u64,u64){
       ( primary_fungible_store::balance(u,get_apt()),primary_fungible_store::balance(u,get_rion()))
    }
}