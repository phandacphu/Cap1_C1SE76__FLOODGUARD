plugins { alias(libs.plugins.android.application) }
android {
    namespace = "com.example.floodguard.gateway"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.example.floodguard.gateway"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1-demo"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}
